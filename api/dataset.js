// GET /api/dataset?ws=<workspace>&proj=<project>
// Proxies the Roboflow project endpoint with a server-side key; returns only what the drawer needs.
export default async function handler(req, res) {
  const ws = req.query.ws, proj = req.query.proj;
  if (!ws || !proj) return res.status(400).json({ error: "expected ?ws=<workspace>&proj=<project>" });
  const key = process.env.ROBOFLOW_API_KEY;
  if (!key) return res.status(500).json({ error: "ROBOFLOW_API_KEY is not set" });
  try {
    const r = await fetch("https://api.roboflow.com/" + encodeURIComponent(ws) + "/" + encodeURIComponent(proj) + "?api_key=" + key);
    if (!r.ok) return res.status(r.status === 404 ? 404 : 502).json({ error: "roboflow " + r.status });
    const j = await r.json();
    const p = j.project || {};
    const versions = (j.versions || []).map(v => ({ id: v.id, name: v.name, images: v.images, created: v.created, model: !!(v.model || v.models) }));
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json({
      name: p.name, type: p.type, images: p.images, unannotated: p.unannotated,
      classes: p.classes || {}, splits: p.splits || {}, created: p.created, updated: p.updated,
      versions, models: versions.filter(v => v.model).length,
      license: p.license, icon: p.icon,
    });
  } catch (e) {
    res.status(502).json({ error: "upstream failed" });
  }
}
