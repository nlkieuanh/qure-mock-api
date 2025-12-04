import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "data", "ads.json");
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    const { searchParams } = new URL(req.url, "http://localhost");
    const platform = searchParams.get("platform");

    let result = json;

    if (platform) {
      result = result.filter(item => item.platform === platform);
    }

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(result);

  } catch (err) {
    console.error("API ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
