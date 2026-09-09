use super::*;

pub struct Danbooru;
pub static DANBOORU: Danbooru = Danbooru;
const BASE: &str = "https://danbooru.donmai.us";

fn auth(credentials: &HashMap<String, String>) -> Vec<(String, String)> {
    match (credentials.get("username"), credentials.get("apiKey")) {
        (Some(username), Some(key)) if !username.is_empty() && !key.is_empty() => {
            vec![
                ("login".into(), username.clone()),
                ("api_key".into(), key.clone()),
            ]
        }
        _ => Vec::new(),
    }
}

fn summary(post: &Value) -> PostSummary {
    let id = string(post.get("id"));
    PostSummary {
        source: "danbooru".into(),
        post_id: id.clone(),
        post_url: format!("{BASE}/posts/{id}"),
        preview_url: string(post.get("large_file_url"))
            .or_else_value(string(post.get("preview_file_url"))),
        sample_url: string(post.get("large_file_url")),
        width: as_u64(post.get("image_width")),
        height: as_u64(post.get("image_height")),
        rating: string(post.get("rating")),
        created_at: string(post.get("created_at")),
        favorite: post.get("is_favorited").and_then(Value::as_bool),
        score: as_i64(post.get("score")),
        fav_count: as_i64(post.get("fav_count")),
    }
}

trait NonEmpty {
    fn or_else_value(self, fallback: String) -> String;
}

impl NonEmpty for String {
    fn or_else_value(self, fallback: String) -> String {
        if self.is_empty() {
            fallback
        } else {
            self
        }
    }
}

fn page_from_raw(
    raw: Value,
    page: usize,
    limit: usize,
    ratings: &[String],
    blacklist: &HashSet<String>,
) -> Result<Page, String> {
    let values = raw
        .as_array()
        .ok_or("danbooru search response must be a list")?;
    let candidates: Vec<_> = values
        .iter()
        .filter(|post| post.get("id").is_some() && is_static_post(post))
        .collect();
    let visible: Vec<_> = candidates
        .iter()
        .copied()
        .filter(|post| !is_blacklisted(post, blacklist))
        .collect();
    let posts: Vec<_> = visible
        .iter()
        .map(|post| summary(post))
        .filter(|post| rating_matches("danbooru", &post.rating, ratings))
        .collect();
    let mut warnings = if visible.len() < candidates.len() {
        vec!["local-blacklist-filtered".into()]
    } else {
        Vec::new()
    };
    if !posts.is_empty() && posts.iter().all(|post| post.preview_url.is_empty()) {
        warnings.push("restricted-media-hidden".into());
        return Ok(Page {
            posts: Vec::new(),
            next_cursor: None,
            ended: true,
            warnings,
            page,
            total: None,
        });
    }
    Ok(Page {
        posts,
        next_cursor: (values.len() == limit).then(|| (page + 1).to_string()),
        ended: values.len() < limit,
        warnings,
        page,
        total: None,
    })
}

fn search_tags(request: &SearchRequest, limit: usize) -> String {
    let mut tags = request.query.trim().to_string();
    if !request.ratings.is_empty() {
        tags = format!("{tags} rating:{}", request.ratings.join(","))
            .trim()
            .into();
    }
    if request.sort == "random" {
        tags = format!("{tags} random:{limit}").trim().into();
    } else if !request.sort.is_empty() && request.sort != "latest" {
        tags = format!("{tags} order:{}", request.sort).trim().into();
    }
    tags
}

fn categories(
    client: &Client,
    tags: &[String],
    credentials: &HashMap<String, String>,
) -> Result<HashMap<String, Vec<String>>, String> {
    let mut result: HashMap<String, Vec<String>> = CATEGORY_ORDER
        .into_iter()
        .map(|key| (key.into(), Vec::new()))
        .collect();
    for chunk in tags.chunks(100) {
        let mut params = vec![
            ("search[name_comma]".into(), chunk.join(",")),
            ("limit".into(), "100".into()),
        ];
        params.extend(auth(credentials));
        let raw = send_json(
            "danbooru",
            client.get(format!("{BASE}/tags.json")).query(&params),
        )?;
        let known: HashMap<String, String> = raw
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|tag| {
                let name = tag.get("name")?.as_str()?.to_string();
                let category = match as_i64(tag.get("category")) {
                    1 => "artist",
                    3 => "copyright",
                    4 => "character",
                    5 => "meta",
                    _ => "general",
                };
                Some((name, category.into()))
            })
            .collect();
        for tag in chunk {
            result
                .entry(known.get(tag).cloned().unwrap_or_else(|| "general".into()))
                .or_default()
                .push(tag.clone());
        }
    }
    Ok(result)
}

impl Provider for Danbooru {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            source: "danbooru",
            display_name: "Danbooru",
            ratings: &["general", "sensitive", "questionable", "explicit"],
            sort_values: &["latest", "score", "favcount"],
            pagination: "page",
            max_page_size: 200,
            auth_fields: &["username", "apiKey"],
            categorized_tags: true,
            favorite_read: true,
            favorite_write: true,
            ranking_periods: &["day", "week", "month"],
            page_jump: true,
            detail_hydration: true,
            download: true,
            auth_required: false,
            tag_search: true,
            max_search_tags: Some(2),
            credentials_url: "https://danbooru.donmai.us/settings",
        }
    }

    fn search(
        &self,
        client: &Client,
        request: &SearchRequest,
        credentials: &HashMap<String, String>,
        blacklist: &HashSet<String>,
    ) -> Result<Page, String> {
        let page = request
            .cursor
            .as_deref()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1)
            .max(1);
        let limit = request.limit.clamp(1, 200);
        let tags = search_tags(request, limit);
        let mut params = vec![
            ("tags".into(), tags),
            ("page".into(), page.to_string()),
            ("limit".into(), limit.to_string()),
        ];
        params.extend(auth(credentials));
        page_from_raw(
            send_json(
                "danbooru",
                client.get(format!("{BASE}/posts.json")).query(&params),
            )?,
            page,
            limit,
            &request.ratings,
            blacklist,
        )
    }

    fn ranking(
        &self,
        client: &Client,
        period: &str,
        request: &RankingRequest,
        credentials: &HashMap<String, String>,
        blacklist: &HashSet<String>,
    ) -> Result<Page, String> {
        let page = request
            .cursor
            .as_deref()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1)
            .max(1);
        let limit = request.limit.clamp(1, 200);
        let mut params = vec![
            ("scale".into(), period.into()),
            ("page".into(), page.to_string()),
            ("limit".into(), limit.to_string()),
        ];
        params.extend(auth(credentials));
        page_from_raw(
            send_json(
                "danbooru",
                client
                    .get(format!("{BASE}/explore/posts/popular.json"))
                    .query(&params),
            )?,
            page,
            limit,
            &request.ratings,
            blacklist,
        )
    }

    fn detail(
        &self,
        client: &Client,
        post_id: &str,
        credentials: &HashMap<String, String>,
    ) -> Result<PostDetail, String> {
        let raw = send_json(
            "danbooru",
            client
                .get(format!("{BASE}/posts/{post_id}.json"))
                .query(&auth(credentials)),
        )?;
        let mut detail = PostDetail::from_summary(summary(&raw));
        detail.media_url = string(raw.get("file_url"));
        detail.sample_url =
            string(raw.get("large_file_url")).or_else_value(string(raw.get("preview_file_url")));
        detail.file_ext = string(raw.get("file_ext"));
        detail.file_size = as_u64(raw.get("file_size"));
        detail.tags = CATEGORY_ORDER
            .into_iter()
            .map(|category| {
                (
                    category.into(),
                    split_tags(raw.get(format!("tag_string_{category}"))),
                )
            })
            .collect();
        detail.complete = true;
        Ok(detail)
    }

    fn classify_tags(
        &self,
        client: &Client,
        tags: &[String],
        credentials: &HashMap<String, String>,
    ) -> Result<HashMap<String, Vec<String>>, String> {
        categories(client, tags, credentials)
    }

    fn known_tags(
        &self,
        client: &Client,
        names: &[String],
        credentials: &HashMap<String, String>,
    ) -> Result<HashSet<String>, String> {
        let mut result = HashSet::new();
        for chunk in names.chunks(100) {
            let mut params = vec![
                ("search[name_comma]".into(), chunk.join(",")),
                ("limit".into(), "100".into()),
            ];
            params.extend(auth(credentials));
            let raw = send_json(
                "danbooru",
                client.get(format!("{BASE}/tags.json")).query(&params),
            )?;
            for tag in raw.as_array().into_iter().flatten() {
                if as_i64(tag.get("post_count")) > 0
                    && !tag
                        .get("is_deprecated")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                {
                    if let Some(name) = tag.get("name").and_then(Value::as_str) {
                        result.insert(name.to_lowercase());
                    }
                }
            }
        }
        Ok(result)
    }

    fn favorites(
        &self,
        client: &Client,
        request: &FavoritesRequest,
        credentials: &HashMap<String, String>,
        blacklist: &HashSet<String>,
    ) -> Result<Page, String> {
        let username = credentials
            .get("username")
            .filter(|v| !v.is_empty())
            .ok_or("danbooru username is required to read favorites")?;
        self.search(
            client,
            &SearchRequest {
                source: "danbooru".into(),
                query: format!("ordfav:{username}"),
                ratings: Vec::new(),
                sort: if request.random {
                    "random".into()
                } else {
                    "latest".into()
                },
                cursor: request.cursor.clone(),
                limit: request.limit,
                page: request.page,
                random: request.random,
            },
            credentials,
            blacklist,
        )
    }

    fn set_favorite(
        &self,
        client: &Client,
        post_id: &str,
        favorite: bool,
        credentials: &HashMap<String, String>,
    ) -> Result<bool, String> {
        let params = auth(credentials);
        if params.is_empty() {
            return Err("danbooru username and API key are required".into());
        }
        let request = if favorite {
            client
                .post(format!("{BASE}/favorites.json"))
                .query(&params)
                .json(&serde_json::json!({"post_id": post_id}))
        } else {
            client
                .delete(format!("{BASE}/favorites/{post_id}.json"))
                .query(&params)
        };
        send_status("danbooru", request)?;
        Ok(favorite)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_post_payload() {
        let post = serde_json::json!({"id": 12, "preview_file_url": "https://cdn.donmai.us/preview.jpg", "large_file_url": "https://cdn.donmai.us/large.jpg", "image_width": 800, "rating": "g"});
        let mapped = summary(&post);
        assert_eq!(mapped.post_id, "12");
        assert_eq!(mapped.preview_url, "https://cdn.donmai.us/large.jpg");
        assert_eq!(mapped.width, 800);
        assert_eq!(mapped.rating, "g");
    }

    #[test]
    fn constructs_provider_search_tags() {
        let request = SearchRequest {
            query: "blue_hair".into(),
            ratings: vec!["general".into(), "sensitive".into()],
            sort: "score".into(),
            ..SearchRequest::default()
        };
        assert_eq!(
            search_tags(&request, 60),
            "blue_hair rating:general,sensitive order:score"
        );
    }
}
