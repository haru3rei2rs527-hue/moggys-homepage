/**
 * メルカリShops（MGY SUPPLY）商品一覧
 * 出品の追加・更新は mercari-items.json を編集してください。
 */
const MERCARI_FEED = "mercari-items.json";

function formatYen(value) {
  return `¥${Number(value).toLocaleString("ja-JP")}`;
}

function createCard(item) {
  const sold = item.status === "sold";
  const card = document.createElement(item.url ? "a" : "article");
  card.className = "mercari-card reveal is-visible";
  if (sold) card.classList.add("is-sold");

  if (item.url) {
    card.href = item.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  const visual = document.createElement("div");
  visual.className = "mercari-card__visual";

  const img = document.createElement("img");
  img.src = item.image;
  img.alt = [item.brand, item.title].filter(Boolean).join(" ");
  img.loading = "lazy";
  visual.appendChild(img);

  if (sold) {
    const badge = document.createElement("span");
    badge.className = "mercari-card__sold";
    badge.textContent = "SOLD";
    visual.appendChild(badge);
  }

  const body = document.createElement("div");
  body.className = "mercari-card__body";

  if (item.brand) {
    const brand = document.createElement("p");
    brand.className = "mercari-card__brand";
    brand.textContent = item.brand;
    body.appendChild(brand);
  }

  const title = document.createElement("h3");
  title.className = "mercari-card__title";
  title.textContent = item.title;
  body.appendChild(title);

  const metaBits = [item.size, item.work].filter(Boolean);
  if (metaBits.length) {
    const meta = document.createElement("p");
    meta.className = "mercari-card__meta";
    meta.textContent = metaBits.join("　/　");
    body.appendChild(meta);
  }

  if (item.price != null) {
    const price = document.createElement("p");
    price.className = "mercari-card__price";
    price.textContent = formatYen(item.price);
    body.appendChild(price);
  }

  card.append(visual, body);
  return card;
}

async function loadMercariFeed() {
  const grid = document.getElementById("mercari-feed");
  const empty = document.getElementById("mercari-empty");
  const shopLink = document.getElementById("mercari-shop-link");
  if (!grid) return;

  grid.dataset.state = "loading";

  try {
    const res = await fetch(MERCARI_FEED);
    if (!res.ok) throw new Error(`mercari feed HTTP ${res.status}`);

    const data = await res.json();
    if (shopLink && data.shopUrl) {
      shopLink.href = data.shopUrl;
    }

    const items = (data.items || []).filter(
      (item) => item.title && item.image && item.status !== "sold"
    );

    if (items.length === 0) throw new Error("No on-sale mercari items");

    grid.innerHTML = "";
    items.forEach((item) => grid.appendChild(createCard(item)));
    grid.dataset.state = "ready";
    if (empty) empty.hidden = true;
  } catch (error) {
    console.warn("[mercari] feed failed.", error);
    grid.dataset.state = "empty";
    if (empty) empty.hidden = false;
  }
}

loadMercariFeed();
