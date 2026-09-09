use super::gelbooru::{first_string, posts, search_for, summary_for};
use super::*;

pub struct Safebooru;
pub static SAFEBOORU: Safebooru = Safebooru;
const BASE: &str = "https://safebooru.org/index.php";

fn attribute(tag: &str, name: &str) -> Option<String> {
    let marker = format!("{name}=\"");
    let rest = tag.split_once(&marker)?.1;
    Some(
        rest.split_once('"')?
            .0
            .replace("&amp;", "&")
            .replace("&quot;", "\""),
    )
}

fn tag_type(client: &Client, name: &str) -> Result<Option<i64>, String> {
    for attempt in 0..2 {
        let response = client
            .get(BASE)
            .query(&[
                ("page", "dapi"),
                ("s", "tag"),
                ("q", "index"),
                ("name", name),
                ("limit", "1"),
            ])
            .header(ACCEPT, "application/xml")
            .send();
        match response {
            Ok(response) if response.status().is_success() => {
                let body = response.text().map_err(|e| e.to_string())?;
                for tag in body.split("<tag ").skip(1) {
                    if attribute(tag, "name").as_deref() == Some(name) {
                        return Ok(attribute(tag, "type").and_then(|value| value.parse().ok()));
                    }
                }
                return Ok(None);
            }
            Ok(response)
                if attempt == 0
                    && (response.status() == StatusCode::NOT_FOUND
                        || response.status() == StatusCode::TOO_MANY_REQUESTS) =>
            {
                thread::sleep(Duration::from_secs(1))
            }
            Ok(response) => {
                return Err(format!(
                    "safebooru tag lookup returned {}",
                    response.status()
                ))
            }
            Err(_) if attempt == 0 => thread::sleep(Duration::from_secs(1)),
            Err(error) => return Err(format!("safebooru tag lookup failed: {error}")),
        }
    }
    unreachable!()
}

fn classify(client: &Client, tags: &[String]) -> HashMap<String, Vec<String>> {
    let mut result: HashMap<String, Vec<String>> = CATEGORY_ORDER
        .into_iter()
        .map(|key| (key.into(), Vec::new()))
        .collect();
    for tag in tags {
        let category = match tag_type(client, tag).ok().flatten() {
            Some(1) => "artist",
            Some(3) => "copyright",
            Some(4) => "character",
            Some(5) => "meta",
            _ => "general",
        };
        result.entry(category.into()).or_default().push(tag.clone());
        thread::sleep(Duration::from_millis(75));
    }
    result
}

impl Provider for Safebooru {
    fn capabilities(&self) -> Capabilities {
        Capabilities {
            source: "safebooru",
            display_name: "Safebooru",
            ratings: &["safe"],
            sort_values: &["latest", "score"],
            pagination: "pid",
            max_page_size: 1000,
            auth_fields: &[],
            categorized_tags: true,
            favorite_read: false,
            favorite_write: false,
            ranking_periods: &[],
            page_jump: true,
            detail_hydration: true,
            download: true,
            auth_required: false,
            tag_search: true,
            max_search_tags: None,
            credentials_url: "",
        }
    }

    fn cursor_for_page(&self, page: usize) -> String {
        page.max(1).saturating_sub(1).to_string()
    }

    fn search(
        &self,
        client: &Client,
        request: &SearchRequest,
        credentials: &HashMap<String, String>,
        blacklist: &HashSet<String>,
    ) -> Result<Page, String> {
        search_for("safebooru", client, request, credentials, blacklist)
    }

    fn detail(
        &self,
        client: &Client,
        post_id: &str,
        credentials: &HashMap<String, String>,
    ) -> Result<PostDetail, String> {
        let post = posts(
            client,
            "safebooru",
            BASE,
            vec![("id".into(), post_id.into()), ("limit".into(), "1".into())],
            credentials,
            false,
        )?
        .into_iter()
        .next()
        .ok_or_else(|| format!("safebooru post {post_id} was not found"))?;
        let mut detail = PostDetail::from_summary(summary_for("safebooru", &post));
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
        _credentials: &HashMap<String, String>,
    ) -> Result<HashMap<String, Vec<String>>, String> {
        Ok(classify(client, tags))
    }

    fn known_tags(
        &self,
        client: &Client,
        names: &[String],
        _credentials: &HashMap<String, String>,
    ) -> Result<HashSet<String>, String> {
        let mut result = HashSet::new();
        for name in names {
            if tag_type(client, name).ok().flatten().is_some() {
                result.insert(name.to_lowercase());
            }
            thread::sleep(Duration::from_millis(75));
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tag_xml_attributes() {
        let tag = r#"name="blue_hair" count="2" type="0" />"#;
        assert_eq!(attribute(tag, "name").as_deref(), Some("blue_hair"));
        assert_eq!(attribute(tag, "type").as_deref(), Some("0"));
    }
}
