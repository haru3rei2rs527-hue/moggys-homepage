/**
 * Behold JSON Feed 連携
 * Feed: https://feeds.behold.so/evZntskGEKAvbafW2Fn3
 */
const BEHOLD_FEED_ID = "evZntskGEKAvbafW2Fn3";

const FEED_LIMIT = 3;

function pickImageUrl(post) {
  return (
    post?.sizes?.medium?.mediaUrl ||
    post?.sizes?.large?.mediaUrl ||
    post?.mediaUrl ||
    ""
  );
}

async function loadInstagramFeed() {
  const grid = document.getElementById("instagram-feed");
  if (!grid) return;

  if (!BEHOLD_FEED_ID) {
    grid.dataset.state = "fallback";
    return;
  }

  grid.dataset.state = "loading";

  try {
    const res = await fetch(`https://feeds.behold.so/${BEHOLD_FEED_ID}`);
    if (!res.ok) throw new Error(`Behold feed HTTP ${res.status}`);

    const data = await res.json();
    const posts = (data.posts || [])
      .map((post) => ({
        ...post,
        imageUrl: pickImageUrl(post),
      }))
      .filter((post) => post.imageUrl && post.permalink)
      .slice(0, FEED_LIMIT);

    if (posts.length === 0) throw new Error("No posts in Behold feed");

    grid.innerHTML = "";
    posts.forEach((post, index) => {
      const link = document.createElement("a");
      link.className = "instagram-grid__item reveal is-visible";
      link.href = post.permalink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const img = document.createElement("img");
      img.src = post.imageUrl;
      img.alt =
        post.altText ||
        post.prunedCaption?.split("\n").find(Boolean) ||
        `Instagram投稿 ${index + 1}`;
      img.loading = index === 0 ? "eager" : "lazy";

      link.appendChild(img);
      grid.appendChild(link);
    });

    grid.dataset.state = "ready";
  } catch (error) {
    console.warn("[instagram] Behold feed failed, keeping fallback.", error);
    grid.dataset.state = "fallback";
  }
}

loadInstagramFeed();
