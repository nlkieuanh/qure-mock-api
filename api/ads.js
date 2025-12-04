import ads from "../data/ads.json" assert { type: "json" };

export default function handler(req, res) {
  const { searchParams } = new URL(req.url, "http://localhost");
  const platform = searchParams.get("platform");

  let result = ads;

  if (platform) {
    result = result.filter(item => item.platform === platform);
  }

  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(JSON.stringify(result));
}
