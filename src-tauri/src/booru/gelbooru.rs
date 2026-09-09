use super::*;

pub struct Gelbooru;
pub static GELBOORU: Gelbooru = Gelbooru;
pub(super) const GEL_BASE: &str = "https://gelbooru.com/index.php";

pub(super) fn auth(credentials: &HashMap<String, String>) -> Vec<(String, String)> {
    let mut user = credentials.get("userId").cloned().unwrap_or_default();
    let mut key = credentials.get("apiKey").cloned().unwrap_or_default();
    if key.contains('=') {
        if let Ok(url) = Url::parse(&format!(
            "https://localhost/?{}",
            key.trim_start_matches(['?', '&'])
        )) {
            let values: HashMap<String, String> = url.query_pairs().into_owned().collect();
            key = values.get("api_key").cloned().unwrap_or(key);
            if user.is_empty() {
                user = values.get("user_id").cloned().unwrap_or_default();
            }
        }
    }
    if user.is_empty() || key.is_empty() {
        Vec::new()
    } else {
        vec![("user_id".into(), user), ("api_key".into(), key)]
    }
}

pub(super) fn normalize_credentials(credentials: &mut HashMap<String, String>) {
    let values: HashMap<_, _> = auth(credentials).into_iter().collect();
    if let Some(user) = values.get("user_id") {
        credentials.insert("userId".into(), user.clone());
    }
    if let Some(key) = values.get("api_key") {
        credentials.insert("apiKey".into(), key.clone());
    }
}

fn require_credentials(
    credentials: &HashMap<String, String>,
) -> Result<Vec<(String, String)>, String> {
    let auth = auth(credentials);
    if auth.is_empty() {
        Err(
            "Gelbooru requires User ID and API Key. Open Settings > Booru Gallery > Accounts."
                .into(),
        )
    } else {
        Ok(auth)
    }
}

pub(super) fn summary_for(source: &str, post: &Value) -> PostSummary {
    let id = string(post.get("id"));
    let base = if source == "safebooru" {
        "https://safebooru.org"
    } else {
        "https://gelbooru.com"
    };
    PostSummary {
        source: source.into(),
        post_id: id.clone(),
        post_url: format!("{base}/index.php?page=post&s=view&id={id}"),
        preview_url: first_string(post, &["preview_url", "sample_url"]),
        sample_url: string(post.get("sample_url")),
        width: as_u64(post.get("width")),
        height: as_u64(post.get("height")),
        rating: if source == "safebooru" {
            string(post.get("rating")).fallback("safe")
        } else {
            string(post.get("rating"))
        },
        created_at: string(post.get("created_at")),
        favorite: None,
        score: as_i64(post.get("score")),
        fav_count: as_i64(post.get("fav_count")),
    }
}

pub(super) trait StringFallback {
    fn fallback(self, value: &str) -> String;
}
impl StringFallback for String {
    fn fallback(self, value: &str) -> String {
        if self.is_empty() {
            value.into()
        } else {
            self
        }
    }
}

pub(super) fn first_string(post: &Value, keys: &[&str]) -> String {
    keys.iter()
        .map(|key| string(post.get(*key)))
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

pub(super) fn posts(
    client: &Client,
    source: &str,
    base: &str,
    params: Vec<(String, String)>,
    credentials: &HashMap<String, String>,
    auth_required: bool,
) -> Result<Vec<Value>, String> {
    let mut query = vec![
        ("page".into(), "dapi".into()),
        ("s".into(), "post".into()),
        ("q".into(), "index".into()),
        ("json".into(), "1".into()),
    ];
    query.extend(params);
    if auth_required {
        query.extend(require_credentials(credentials)?);
    }
    let raw = send_json(source, client.get(base).query(&query))?;
    let values = if let Some(values) = raw.as_array() {
        values.clone()
    } else {
        raw.get("post")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    Ok(values)
}

pub(super) fn search_for(
    source: &str,
    client: &Client,
    request: &SearchRequest,
    credentials: &HashMap<String, String>,
    blacklist: &HashSet<String>,
) -> Result<Page, String> {
    let (base, auth_required, max_limit) = match source {
        "gelbooru" => (GEL_BASE, true, 100),
        "safebooru" => ("https://safebooru.org/index.php", false, 1000),
        _ => return Err(format!("unsupported Gelbooru-compatible source: {source}")),
    };
    let pid = request
        .cursor
        .as_deref()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let limit = request.limit.clamp(1, max_limit);
    let mut tags = request.query.trim().to_string();
    if request.ratings.len() == 1 {
        tags = format!("{tags} rating:{}", request.ratings[0])
            .trim()
            .into();
    }
    if request.sort == "score" {
        tags = format!("{tags} sort:score:desc").trim().into();
    } else if request.sort == "random" {
        tags = format!("{tags} sort:random").trim().into();
    }
    let raw = posts(
        client,
        source,
        base,
        vec![
            ("tags".into(), tags),
            ("pid".into(), pid.to_string()),
            ("limit".into(), limit.to_string()),
        ],
        credentials,
        auth_required,
    )?;
    let candidates: Vec<_> = raw
        .iter()
        .filter(|post| post.get("id").is_some() && is_static_post(post))
        .collect();
    let visible: Vec<_> = candidates
        .iter()
        .copied()
        .filter(|post| !is_blacklisted(post, blacklist))
        .collect();
    let mapped = visible
        .iter()
        .map(|post| summary_for(source, post))
        .filter(|post| rating_matches(source, &post.rating, &request.ratings))
        .collect();
    Ok(Page {
        posts: mapped,
        next_cursor: (raw.len() == limit).then(|| (pid + 1).to_string()),
        ended: raw.len() < limit,
        warnings: if visible.len() < candidates.len() {
            vec!["local-blacklist-filtered".into()]
        } else {
            Vec::new()
        },
        page: pid + 1,
        total: None,
    })
}

fn tag_items(
    client: &Client,
    names: &[String],
    credentials: &HashMap<String, String>,
) -> Result<Vec<Value>, String> {
    let mut params = vec![
        ("page".into(), "dapi".into()),
        ("s".into(), "tag".into()),
        ("q".into(), "index".into()),
        ("json".into(), "1".into()),
        ("names".into(), names.join(" ")),
        ("limit".into(), "100".into()),
    ];
    params.extend(require_credentials(credentials)?);
    let raw = send_json("gelbooru", client.get(GEL_BASE).query(&params))?;
    Ok(if let Some(values) = raw.as_array() {
        values.clone()
    } else {
        raw.get("tag")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    })
}

impl Provider for Gelbooru {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            source: "gelbooru",
            display_name: "Gelbooru",
            ratings: &["general", "sensitive", "questionable", "explicit"],
            sort_values: &["latest", "score"],
            pagination: "pid",
            max_page_size: 100,
            auth_fields: &["userId", "apiKey"],
            categorized_tags: true,
            favorite_read: true,
            favorite_write: false,
            ranking_periods: &[],
            page_jump: true,
            detail_hydration: true,
            download: true,
            auth_required: true,
            tag_search: true,
            max_search_tags: None,
            credentials_url: "https://gelbooru.com/index.php?page=account&s=options",
        }
    }

    fn cursor_for_page(&self, page: usize) -> String {
        page.max(1).saturating_sub(1).to_string()
    }

    fn media_referer(&self) -> Option<&'static str> {
        Some("https://gelbooru.com/")
    }

    fn search(
        &self,
        client: &Client,
        request: &SearchRequest,
        credentials: &HashMap<String, String>,
        blacklist: &HashSet<String>,
    ) -> Result<Page, String> {
        search_for("gelbooru", client, request, credentials, blacklist)
    }

    fn detail(
        &self,
        client: &Client,
        post_id: &str,
        credentials: &HashMap<String, String>,
    ) -> Result<PostDetail, String> {
        let post = posts(
            client,
            "gelbooru",
            GEL_BASE,
            vec![("id".into(), post_id.into()), ("limit".into(), "1".into())],
            credentials,
            true,
        )?
        .into_iter()
        .next()
        .ok_or_else(|| format!("gelbooru post {post_id} was not found"))?;
        let mut detail = PostDetail::from_summary(summary_for("gelbooru", &post));
        detail.media_url = first_string(&post, &["file_url", "source"]);
        detail.sample_url = first_string(&post, &["sample_url", "preview_url"]);
        detail.file_ext = detail
            .media_url
            .split(['?', '#'])
            .next()
            .unwrap_or_default()
            .rsplit('.')
            .next()
            .unwrap_or_default()
            .to_lowercase();
        detail.file_size = as_u64(post.get("file_size"));
        detail.tags = group_as_general(&split_tags(post.get("tags")));
        detail.complete = false;
        Ok(detail)
    }

    fn classify_tags(
        &self,
        client: &Client,
        tags: &[String],
        credentials: &HashMap<String, String>,
    ) -> Result<HashMap<String, Vec<String>>, String> {
        let mut result: HashMap<String, Vec<String>> = CATEGORY_ORDER
            .into_iter()
            .map(|key| (key.into(), Vec::new()))
            .collect();
        for chunk in tags.chunks(100) {
            let known: HashMap<String, String> = tag_items(client, chunk, credentials)?
                .iter()
                .filter_map(|tag| {
                    let category = match as_i64(tag.get("type")) {
                        1 => "artist",
                        3 => "copyright",
                        4 => "character",
                        5 => "meta",
                        _ => "general",
                    };
                    Some((tag.get("name")?.as_str()?.into(), category.into()))
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

    fn known_tags(
        &self,
        client: &Client,
        names: &[String],
        credentials: &HashMap<String, String>,
    ) -> Result<HashSet<String>, String> {
        let mut known = HashSet::new();
        for chunk in names.chunks(100) {
            for tag in tag_items(client, chunk, credentials)? {
                if tag.get("count").is_none() || as_i64(tag.get("count")) > 0 {
                    if let Some(name) = tag.get("name").and_then(Value::as_str) {
                        known.insert(name.to_lowercase());
                    }
                }
            }
        }
        Ok(known)
    }

    fn favorites(
        &self,
        client: &Client,
        request: &FavoritesRequest,
        credentials: &HashMap<String, String>,
        blacklist: &HashSet<String>,
    ) -> Result<Page, String> {
        let user = credentials
            .get("userId")
            .filter(|v| !v.is_empty())
            .ok_or("gelbooru User ID is required to read favorites")?;
        self.search(
            client,
            &SearchRequest {
                source: "gelbooru".into(),
                query: format!("fav:{user}"),
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_copied_account_fragment() {
        let credentials = HashMap::from([("apiKey".into(), "&api_key=secret&user_id=42".into())]);
        assert_eq!(
            auth(&credentials),
            [
                ("user_id".into(), "42".into()),
                ("api_key".into(), "secret".into())
            ]
        );
    }
}
