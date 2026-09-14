const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,
      headers: headers(options.headers || {})
    }
  );

  const text = await response.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof data === "string"
        ? data
        : data?.message || `Supabase request failed (${response.status})`
    );
  }

  return data;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const projects = await supabase(
        "projects?select=*&order=updated_at.desc"
      );

      const history = await supabase(
        "project_history?select=*&order=history_date.desc,created_at.desc"
      );

      return res.status(200).json({
        ok: true,
        projects: projects || [],
        history: history || []
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const action = body.action || "create";

      if (action === "create") {
        const project = body.project;

        if (!project) {
          return res.status(400).json({
            ok: false,
            error: "Project data is required."
          });
        }

        const created = await supabase("projects", {
          method: "POST",
          headers: {
            Prefer: "return=representation"
          },
          body: JSON.stringify(project)
        });

        return res.status(200).json({
          ok: true,
          project: created?.[0] || null
        });
      }

      if (action === "update") {
        const id = body.id;
        const project = body.project;

        if (!id || !project) {
          return res.status(400).json({
            ok: false,
            error: "Project id and project data are required."
          });
        }

        const updated = await supabase(
          `projects?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation"
            },
            body: JSON.stringify(project)
          }
        );

        return res.status(200).json({
          ok: true,
          project: updated?.[0] || null
        });
      }

      if (action === "add_history") {
        const history = body.history;

        if (!history) {
          return res.status(400).json({
            ok: false,
            error: "History data is required."
          });
        }

        const created = await supabase("project_history", {
          method: "POST",
          headers: {
            Prefer: "return=representation"
          },
          body: JSON.stringify(history)
        });

        return res.status(200).json({
          ok: true,
          history: created?.[0] || null
        });
      }

      if (action === "update_history") {
        const id = body.id;
        const history = body.history;

        if (!id || !history) {
          return res.status(400).json({
            ok: false,
            error: "History id and data are required."
          });
        }

        const updated = await supabase(
          `project_history?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation"
            },
            body: JSON.stringify(history)
          }
        );

        return res.status(200).json({
          ok: true,
          history: updated?.[0] || null
        });
      }

      if (action === "delete_history") {
        const id = body.id;

        if (!id) {
          return res.status(400).json({
            ok: false,
            error: "History id is required."
          });
        }

        await supabase(
          `project_history?id=eq.${encodeURIComponent(id)}`,
          {
            method: "DELETE"
          }
        );

        return res.status(200).json({
          ok: true
        });
      }

      return res.status(400).json({
        ok: false,
        error: `Unknown action: ${action}`
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Method not allowed."
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Server error"
    });
  }
}
