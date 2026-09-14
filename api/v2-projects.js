const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

function makeHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase environment variables are missing.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: makeHeaders(options.headers || {}),
  });

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

async function getMasterData() {
  const [clients, sites] = await Promise.all([
    sb("clients?select=*&order=name.asc"),
    sb("sites?select=*&order=name.asc"),
  ]);

  return {
    clients: clients || [],
    sites: sites || [],
  };
}

async function getProjects() {
  const projects = await sb(
    "projects?select=*&order=updated_at.desc,created_at.desc"
  );

  const history = await sb(
    "project_history?select=*&order=history_date.desc,created_at.desc"
  );

  return {
    projects: projects || [],
    history: history || [],
  };
}

export default async function handler(req, res) {
  try {
    const action = req.query?.action || req.body?.action || "list";

    if (req.method === "GET") {
      if (action === "master") {
        const master = await getMasterData();

        return res.status(200).json({
          ok: true,
          ...master,
        });
      }

      if (action === "list") {
        const data = await getProjects();

        return res.status(200).json({
          ok: true,
          ...data,
        });
      }

      return res.status(400).json({
        ok: false,
        error: `Unknown GET action: ${action}`,
      });
    }

    if (req.method === "POST") {
      if (action === "create") {
        const project = req.body?.project;

        if (!project) {
          return res.status(400).json({
            ok: false,
            error: "Project data is required.",
          });
        }

        const created = await sb("projects", {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            ...project,
            updated_at: new Date().toISOString(),
          }),
        });

        return res.status(200).json({
          ok: true,
          project: created?.[0] || null,
        });
      }

      if (action === "update") {
        const id = req.body?.id;
        const project = req.body?.project;

        if (!id || !project) {
          return res.status(400).json({
            ok: false,
            error: "Project id and project data are required.",
          });
        }

        const currentRows = await sb(
          `projects?id=eq.${encodeURIComponent(id)}&select=*`
        );

        const current = currentRows?.[0];

        if (!current) {
          return res.status(404).json({
            ok: false,
            error: "Project not found.",
          });
        }

        const updated = await sb(
          `projects?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              ...project,
              updated_at: new Date().toISOString(),
            }),
          }
        );

        const trackFields = [
          "client_id",
          "site_id",
          "project_name",
          "country",
          "format",
          "auditorium",
          "bm",
          "status",
          "stage",
          "signing_text",
          "shipping_text",
          "opening_text",
          "owner",
          "next_action",
        ];

        const labels = {
          client_id: "Client",
          site_id: "Site",
          project_name: "Project Name",
          country: "Country",
          format: "Format",
          auditorium: "Auditorium",
          bm: "BM",
          status: "Status",
          stage: "Stage",
          signing_text: "Signing",
          shipping_text: "Shipping",
          opening_text: "Opening",
          owner: "Owner",
          next_action: "Next Action",
        };

        const changeNote = req.body?.change_note || null;

        const historyRows = [];

        for (const field of trackFields) {
          const beforeValue = current[field] ?? "";
          const afterValue =
            project[field] !== undefined
              ? project[field] ?? ""
              : current[field] ?? "";

          if (String(beforeValue) !== String(afterValue)) {
            historyRows.push({
              project_id: Number(id),
              history_date: new Date().toISOString().slice(0, 10),
              history_type: labels[field] || field,
              title: `${labels[field] || field} updated`,
              before_value: String(beforeValue),
              after_value: String(afterValue),
              note: changeNote,
              source: "Project edit",
            });
          }
        }

        if (historyRows.length) {
          await sb("project_history", {
            method: "POST",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify(historyRows),
          });
        }

        return res.status(200).json({
          ok: true,
          project: updated?.[0] || null,
          history_created: historyRows.length,
        });
      }

      if (action === "history_create") {
        const history = req.body?.history;

        if (!history) {
          return res.status(400).json({
            ok: false,
            error: "History data is required.",
          });
        }

        const created = await sb("project_history", {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify(history),
        });

        return res.status(200).json({
          ok: true,
          history: created?.[0] || null,
        });
      }

      if (action === "history_update") {
        const id = req.body?.id;
        const history = req.body?.history;

        if (!id || !history) {
          return res.status(400).json({
            ok: false,
            error: "History id and data are required.",
          });
        }

        const updated = await sb(
          `project_history?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: {
              Prefer: "return=representation",
            },
            body: JSON.stringify(history),
          }
        );

        return res.status(200).json({
          ok: true,
          history: updated?.[0] || null,
        });
      }

      if (action === "history_delete") {
        const id = req.body?.id;

        if (!id) {
          return res.status(400).json({
            ok: false,
            error: "History id is required.",
          });
        }

        await sb(
          `project_history?id=eq.${encodeURIComponent(id)}`,
          {
            method: "DELETE",
          }
        );

        return res.status(200).json({
          ok: true,
        });
      }

      return res.status(400).json({
        ok: false,
        error: `Unknown POST action: ${action}`,
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Method not allowed.",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Server error",
    });
  }
}
