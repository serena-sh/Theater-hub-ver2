const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

function json(res, status, body) {
  res.status(status);
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );
  res.end(JSON.stringify(body));
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sb(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY"
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      ...options,
      headers: headers(options.headers || {}),
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
    let message = `Supabase request failed (${response.status})`;

    if (typeof data === "object" && data) {
      message =
        data.message ||
        data.hint ||
        JSON.stringify(data);
    } else if (data) {
      message = String(data);
    }

    throw new Error(message);
  }

  return data;
}

const q = (value) =>
  encodeURIComponent(String(value));


module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        message: "v2-sites API is running",
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, {
        ok: false,
        error: "Method not allowed",
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const action = body.action;


    /* =====================================================
       DELETE SITE
    ===================================================== */

    if (action === "site_delete") {
      const id = Number(body.id);

      if (!id) {
        return json(res, 400, {
          ok: false,
          error: "Site id is required",
        });
      }


      /* -----------------------------------------------------
         1. Check that the Site exists
      ----------------------------------------------------- */

      const sites = await sb(
        `sites?id=eq.${q(id)}&select=*`
      );

      const site = sites?.[0];

      if (!site) {
        return json(res, 404, {
          ok: false,
          error: "Site not found",
        });
      }


      /* -----------------------------------------------------
         2. Check linked Projects

         A Site with linked Projects must not be deleted.
      ----------------------------------------------------- */

      const linkedProjects = await sb(
        `projects?site_id=eq.${q(id)}&select=id,project_name`
      ).catch(() => []);

      if (
        Array.isArray(linkedProjects) &&
        linkedProjects.length > 0
      ) {
        return json(res, 409, {
          ok: false,
          error:
            `Cannot delete this Site because ${linkedProjects.length} Project(s) are linked to it.`,
          linked_projects: linkedProjects,
        });
      }


      /* -----------------------------------------------------
         3. Delete Site

         DELETE is filtered by the exact Site ID.
      ----------------------------------------------------- */

      await sb(
        `sites?id=eq.${q(id)}`,
        {
          method: "DELETE",
          headers: {
            Prefer: "return=minimal",
          },
        }
      );


      return json(res, 200, {
        ok: true,
        deleted_id: id,
        deleted_name:
          site.name ||
          site.site_name ||
          `Site ${id}`,
      });
    }


    /* =====================================================
       UNKNOWN ACTION
    ===================================================== */

    return json(res, 400, {
      ok: false,
      error: `Unknown action: ${action}`,
    });

  } catch (error) {
    console.error(error);

    return json(res, 500, {
      ok: false,
      error:
        error?.message ||
        String(error),
    });
  }
};
