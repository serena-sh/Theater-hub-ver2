const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function json(res, status, body) {
  res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function sb(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY"
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      ...opts,
      headers: headers(opts.headers || {}),
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      typeof data === "object"
        ? data.message || data.hint || JSON.stringify(data)
        : String(data || response.status)
    );
  }

  return data;
}

const q = (value) =>
  encodeURIComponent(String(value));

const isoDate = () =>
  new Date().toISOString().slice(0, 10);

function siteName(row) {
  return (
    row.site_name ||
    row.name ||
    row.theater_name ||
    row.cinema_name ||
    row.project_name ||
    `Site ${row.id}`
  );
}

function asFormats(value) {
  if (Array.isArray(value)) return value;

  if (value == null || value === "") {
    return [];
  }

  return String(value)
    .split(/[,/]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function master() {
  const [clientsRaw, sitesRaw] =
    await Promise.all([
      sb(
        "clients?select=*&order=name.asc"
      ),
      sb(
        "sites?select=*&order=id.asc"
      ).catch(() => []),
    ]);

  const clientMap = new Map(
    (clientsRaw || []).map((client) => [
      Number(client.id),
      client.name ||
        `Client ${client.id}`,
    ])
  );

  const clients = (
    clientsRaw || []
  ).map((client) => ({
    id: Number(client.id),

    name:
      client.name ||
      `Client ${client.id}`,

    country:
      client.country ||
      client.region ||
      client.country_region ||
      "",

    type:
      client.client_type ||
      client.type ||
      "Exhibitor",

    status:
      client.status ||
      "Active",

    note:
      client.notes ||
      client.note ||
      "",
  }));

  const sites = (
    sitesRaw || []
  ).map((site) => ({
    id: Number(site.id),

    client_id:
      site.client_id == null
        ? null
        : Number(site.client_id),

    client:
      clientMap.get(
        Number(site.client_id)
      ) ||
      site.client_name ||
      "",

    name: siteName(site),

    country:
      site.country || "",

    city:
      site.city || "",

    address:
      site.address ||
      site.address_text ||
      "",

    status:
      site.status ||
      "Operating",

    formats: asFormats(
      site.formats ||
        site.format
    ),

    lat: Number(
      site.latitude ?? site.lat
    ),

    lng: Number(
      site.longitude ?? site.lng
    ),
  }));

  return {
    clients,
    sites,
  };
}

async function listProjects() {
  const rows = await sb(
    "projects?select=*&order=updated_at.desc"
  );

  const history = await sb(
    "project_history?select=*&order=event_date.desc,created_at.desc"
  );

  const byProject = new Map();

  for (const item of history || []) {
    const key = Number(
      item.project_id
    );

    if (!byProject.has(key)) {
      byProject.set(key, []);
    }

    byProject
      .get(key)
      .push(item);
  }

  const masterData =
    await master();

  const clientMap = new Map(
    masterData.clients.map(
      (client) => [
        client.id,
        client.name,
      ]
    )
  );

  const siteMap = new Map(
    masterData.sites.map(
      (site) => [
        site.id,
        site.name,
      ]
    )
  );

  return (rows || []).map(
    (row) => ({
      ...row,

      client:
        clientMap.get(
          Number(row.client_id)
        ) ||
        row.client_name_snapshot ||
        "Unassigned",

      site:
        siteMap.get(
          Number(row.site_id)
        ) ||
        row.site_name_snapshot ||
        null,

      history:
        byProject.get(
          Number(row.id)
        ) || [],
    })
  );
}

function cleanProject(project = {}) {
  const allowed = [
    "client_id",
    "site_id",

    "client_name_snapshot",
    "site_name_snapshot",

    "project_name",

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

    "notes",

    "source_label",
  ];

  const output = {};

  for (const key of allowed) {
    if (
      Object.prototype.hasOwnProperty.call(
        project,
        key
      )
    ) {
      output[key] =
        project[key] === ""
          ? null
          : project[key];
    }
  }

  if (
    output.client_id ===
    "null"
  ) {
    output.client_id = null;
  }

  if (
    output.site_id ===
    "null"
  ) {
    output.site_id = null;
  }

  return output;
}

async function oneProject(id) {
  const rows = await sb(
    `projects?id=eq.${q(
      id
    )}&select=*`
  );

  return rows?.[0] || null;
}

async function createHistory(
  projectId,
  history = {}
) {
  const body = {
    project_id:
      Number(projectId),

    event_date:
      history.event_date ||
      isoDate(),

    change_type:
      history.change_type ||
      "Note",

    title:
      history.title ||
      "History update",

    before_value:
      history.before_value ||
      null,

    after_value:
      history.after_value ||
      null,

    note:
      history.note ||
      null,

    source:
      history.source ||
      "Manual",
  };

  const rows = await sb(
    "project_history",
    {
      method: "POST",

      headers: {
        Prefer:
          "return=representation",
      },

      body: JSON.stringify(
        body
      ),
    }
  );

  return rows?.[0] || null;
}

module.exports =
  async function handler(
    req,
    res
  ) {
    try {
      if (
        req.method === "GET"
      ) {
        const action =
          req.query?.action ||
          "list";

        if (
          action === "master"
        ) {
          return json(
            res,
            200,
            {
              ok: true,
              ...(await master()),
            }
          );
        }

        if (
          action === "list"
        ) {
          return json(
            res,
            200,
            {
              ok: true,
              projects:
                await listProjects(),
            }
          );
        }

        return json(
          res,
          400,
          {
            ok: false,
            error:
              "Unknown GET action",
          }
        );
      }

      if (
        req.method !== "POST"
      ) {
        return json(
          res,
          405,
          {
            ok: false,
            error:
              "Method not allowed",
          }
        );
      }

      const body =
        typeof req.body ===
        "string"
          ? JSON.parse(
              req.body || "{}"
            )
          : req.body || {};

      const action =
        body.action;

      if (
        action === "create"
      ) {
        const project =
          cleanProject(
            body.project
          );

        if (
          !project.project_name
        ) {
          return json(
            res,
            400,
            {
              ok: false,
              error:
                "project_name is required",
            }
          );
        }

        const rows = await sb(
          "projects",
          {
            method: "POST",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                project
              ),
          }
        );

        const created =
          rows?.[0];

        if (
          body.initial_note?.trim()
        ) {
          await createHistory(
            created.id,
            {
              change_type:
                "Note",

              title:
                "Project created",

              note:
                body.initial_note.trim(),

              source:
                "Manual",
            }
          );
        } else {
          await createHistory(
            created.id,
            {
              change_type:
                "Project",

              title:
                "Project created",

              after_value:
                created.project_name,

              source:
                "System",
            }
          );
        }

        return json(
          res,
          200,
          {
            ok: true,
            project:
              created,
          }
        );
      }

      if (
        action === "update"
      ) {
        const id =
          Number(body.id);

        if (!id) {
          return json(
            res,
            400,
            {
              ok: false,
              error:
                "id is required",
            }
          );
        }

        const old =
          await oneProject(
            id
          );

        if (!old) {
          return json(
            res,
            404,
            {
              ok: false,
              error:
                "Project not found",
            }
          );
        }

        const patch =
          cleanProject(
            body.project
          );

        const rows = await sb(
          `projects?id=eq.${q(
            id
          )}`,
          {
            method: "PATCH",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                patch
              ),
          }
        );

        const updated =
          rows?.[0] || {
            ...old,
            ...patch,
          };

        const fields = {
          client_id:
            "Client",

          site_id:
            "Site",

          project_name:
            "Project Name",

          format:
            "Format",

          auditorium:
            "Auditorium",

          bm:
            "BM",

          status:
            "Status",

          stage:
            "Stage",

          signing_text:
            "Signing",

          shipping_text:
            "Shipping",

          opening_text:
            "Opening",

          owner:
            "Owner",

          next_action:
            "Next Action",
        };

        const types = {
          status:
            "Status",

          stage:
            "Stage",

          signing_text:
            "Signing",

          shipping_text:
            "Shipping",

          opening_text:
            "Opening",

          site_id:
            "Site",
        };

        let changes = 0;

        for (
          const [key, label]
          of Object.entries(
            fields
          )
        ) {
          if (
            !Object.prototype.hasOwnProperty.call(
              patch,
              key
            )
          ) {
            continue;
          }

          const before =
            old[key] == null
              ? ""
              : String(
                  old[key]
                );

          const after =
            updated[key] ==
            null
              ? ""
              : String(
                  updated[key]
                );

          if (
            before === after
          ) {
            continue;
          }

          changes++;

          await createHistory(
            id,
            {
              change_type:
                types[key] ||
                "Project",

              title:
                `${label} updated`,

              before_value:
                before || "-",

              after_value:
                after || "-",

              note:
                body.change_note ||
                null,

              source:
                "System",
            }
          );
        }

        if (
          changes === 0 &&
          body.change_note?.trim()
        ) {
          await createHistory(
            id,
            {
              change_type:
                "Note",

              title:
                "Project note",

              note:
                body.change_note.trim(),

              source:
                "Manual",
            }
          );
        }

        return json(
          res,
          200,
          {
            ok: true,

            project:
              updated,

            changes,
          }
        );
      }

      if (
        action ===
        "history_create"
      ) {
        const history =
          await createHistory(
            body.project_id,
            body.history || {}
          );

        return json(
          res,
          200,
          {
            ok: true,
            history,
          }
        );
      }

      if (
        action ===
        "history_update"
      ) {
        const id =
          Number(
            body.history_id
          );

        if (!id) {
          return json(
            res,
            400,
            {
              ok: false,
              error:
                "history_id is required",
            }
          );
        }

        const history =
          body.history || {};

        const patch = {
          event_date:
            history.event_date ||
            isoDate(),

          change_type:
            history.change_type ||
            "Note",

          title:
            history.title ||
            "History update",

          before_value:
            history.before_value ||
            null,

          after_value:
            history.after_value ||
            null,

          note:
            history.note ||
            null,

          source:
            history.source ||
            "Manual",
        };

        const rows = await sb(
          `project_history?id=eq.${q(
            id
          )}`,
          {
            method: "PATCH",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                patch
              ),
          }
        );

        return json(
          res,
          200,
          {
            ok: true,

            history:
              rows?.[0] ||
              null,
          }
        );
      }

      if (
        action ===
        "history_delete"
      ) {
        const id =
          Number(
            body.history_id
          );

        if (!id) {
          return json(
            res,
            400,
            {
              ok: false,
              error:
                "history_id is required",
            }
          );
        }

        await sb(
          `project_history?id=eq.${q(
            id
          )}`,
          {
            method: "DELETE",

            headers: {
              Prefer:
                "return=minimal",
            },
          }
        );

        return json(
          res,
          200,
          {
            ok: true,
          }
        );
      }

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Unknown action",
        }
      );
    } catch (err) {
      console.error(err);

      return json(
        res,
        500,
        {
          ok: false,

          error:
            err.message ||
            String(err),
        }
      );
    }
  };
