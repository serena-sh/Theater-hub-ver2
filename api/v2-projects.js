const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;


/* =========================================================
   COMMON
========================================================= */

function json(res, status, body) {
  res.status(status);

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );

  res.setHeader(
    "Expires",
    "0"
  );

  res.end(
    JSON.stringify(body)
  );
}


function headers(extra = {}) {
  return {
    apikey:
      SUPABASE_KEY,

    Authorization:
      `Bearer ${SUPABASE_KEY}`,

    "Content-Type":
      "application/json",

    ...extra,
  };
}


async function sb(path, options = {}) {
  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY
  ) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY"
    );
  }

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        ...options,

        headers:
          headers(
            options.headers || {}
          ),
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    let message =
      `Supabase request failed (${response.status})`;

    if (
      typeof data === "object" &&
      data
    ) {
      message =
        data.message ||
        data.hint ||
        JSON.stringify(data);
    } else if (data) {
      message =
        String(data);
    }

    throw new Error(message);
  }

  return data;
}


/*
 * Supabase / PostgREST 기본 반환 제한을 피하기 위한
 * 전체 페이지 조회 함수
 */
async function sbAll(
  path,
  pageSize = 1000
) {
  const all = [];

  let start = 0;

  while (true) {
    const end =
      start + pageSize - 1;

    const rows =
      await sb(
        path,
        {
          headers: {
            Range:
              `${start}-${end}`,

            "Range-Unit":
              "items",
          },
        }
      );

    if (!Array.isArray(rows)) {
      return rows || [];
    }

    all.push(...rows);

    if (
      rows.length < pageSize
    ) {
      break;
    }

    start += pageSize;
  }

  return all;
}


const q =
  value =>
    encodeURIComponent(
      String(value)
    );


const isoDate =
  () =>
    new Date()
      .toISOString()
      .slice(0, 10);


function siteName(row) {
  return (
    row.name ||
    row.site_name ||
    row.theater_name ||
    row.cinema_name ||
    `Site ${row.id}`
  );
}


function splitFormats(value) {
  if (!value) {
    return [];
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .map(String)
      .map(
        value =>
          value.trim()
      )
      .filter(Boolean);
  }

  return String(value)
    .split(/[,/]/)
    .map(
      value =>
        value.trim()
    )
    .filter(Boolean);
}


function getSiteFormats(
  site = {}
) {
  const formats = [];

  if (
    site.has_4dx === true
  ) {
    formats.push("4DX");
  }

  if (
    site.has_screenx === true
  ) {
    formats.push("ScreenX");
  }

  if (
    site.has_ultra4dx === true
  ) {
    formats.push(
      "ULTRA 4DX"
    );
  }

  if (
    site.has_imax === true
  ) {
    formats.push("IMAX");
  }

  for (
    const format
    of splitFormats(
      site.other_formats
    )
  ) {
    if (
      !formats.includes(
        format
      )
    ) {
      formats.push(
        format
      );
    }
  }

  return formats;
}


function numberOrNull(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}


/* =========================================================
   MASTER DATA
========================================================= */

async function master() {
  const [
    clientsRaw,
    sitesRaw,
  ] =
    await Promise.all([
      sbAll(
        "clients?select=*&order=name.asc"
      ),

      sbAll(
        "sites?select=*&order=id.asc"
      ),
    ]);


  const clientMap =
    new Map(
      (clientsRaw || [])
        .map(
          client => [
            Number(
              client.id
            ),

            client.name ||
              `Client ${client.id}`,
          ]
        )
    );


  const clients =
    (clientsRaw || [])
      .map(
        client => ({
          id:
            Number(
              client.id
            ),

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

          cj_client_order:
            client.cj_client_order ==
            null
              ? null
              : Number(
                  client.cj_client_order
                ),
        })
      );


  const sites =
    (sitesRaw || [])
      .map(
        site => ({
          id:
            Number(
              site.id
            ),

          client_id:
            site.client_id ==
            null
              ? null
              : Number(
                  site.client_id
                ),

          client:
            clientMap.get(
              Number(
                site.client_id
              )
            ) ||
            site.client_name ||
            "",

          name:
            siteName(
              site
            ),

          country:
            site.country ||
            "",

          city:
            site.city ||
            site.area ||
            "",

          area:
            site.area ||
            "",

          address:
            site.address ||
            site.address_text ||
            "",

          status:
            site.status ||
            "Operating",

          formats:
            getSiteFormats(
              site
            ),

          has_4dx:
            site.has_4dx ===
            true,

          has_screenx:
            site.has_screenx ===
            true,

          has_ultra4dx:
            site.has_ultra4dx ===
            true,

          has_imax:
            site.has_imax ===
            true,

          other_formats:
            site.other_formats ||
            "",

          latitude:
            numberOrNull(
              site.latitude
            ),

          longitude:
            numberOrNull(
              site.longitude
            ),

          // Front-end compatibility
          lat:
            numberOrNull(
              site.latitude
            ),

          lng:
            numberOrNull(
              site.longitude
            ),

          notes:
            site.notes ||
            "",

          source:
            site.source ||
            "",

          format_verification:
            site.format_verification ||
            "",
        })
      );


  return {
    clients,
    sites,
  };
}


/* =========================================================
   PROJECTS
========================================================= */

async function listProjects() {
  const rows =
    await sbAll(
      "projects?select=*&order=updated_at.desc"
    );


  const history =
    await sbAll(
      "project_history?select=*&order=event_date.desc,created_at.desc"
    );


  const historyMap =
    new Map();


  for (
    const item
    of history || []
  ) {
    const projectId =
      Number(
        item.project_id
      );

    if (
      !historyMap.has(
        projectId
      )
    ) {
      historyMap.set(
        projectId,
        []
      );
    }

    historyMap
      .get(projectId)
      .push(item);
  }


  const masterData =
    await master();


  const clientMap =
    new Map(
      masterData.clients
        .map(
          client => [
            client.id,
            client.name,
          ]
        )
    );


  const siteMap =
    new Map(
      masterData.sites
        .map(
          site => [
            site.id,
            site.name,
          ]
        )
    );


  return (rows || [])
    .map(
      row => ({
        ...row,

        client:
          clientMap.get(
            Number(
              row.client_id
            )
          ) ||
          row.client_name_snapshot ||
          "Unassigned",

        site:
          siteMap.get(
            Number(
              row.site_id
            )
          ) ||
          row.site_name_snapshot ||
          null,

        history:
          historyMap.get(
            Number(
              row.id
            )
          ) ||
          [],
      })
    );
}


function cleanProject(
  project = {}
) {
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


  for (
    const key
    of allowed
  ) {
    if (
      Object.prototype
        .hasOwnProperty
        .call(
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
    output.client_id =
      null;
  }


  if (
    output.site_id ===
    "null"
  ) {
    output.site_id =
      null;
  }


  if (
    output.client_id !==
      undefined &&
    output.client_id !==
      null
  ) {
    output.client_id =
      Number(
        output.client_id
      );
  }


  if (
    output.site_id !==
      undefined &&
    output.site_id !==
      null
  ) {
    output.site_id =
      Number(
        output.site_id
      );
  }


  return output;
}


async function oneProject(
  id
) {
  const rows =
    await sb(
      `projects?id=eq.${q(id)}&select=*`
    );

  return (
    rows?.[0] ||
    null
  );
}


/* =========================================================
   PROJECT HISTORY
========================================================= */

async function createHistory(
  projectId,
  history = {}
) {
  const payload = {
    project_id:
      Number(
        projectId
      ),

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


  const rows =
    await sb(
      "project_history",
      {
        method:
          "POST",

        headers: {
          Prefer:
            "return=representation",
        },

        body:
          JSON.stringify(
            payload
          ),
      }
    );


  return (
    rows?.[0] ||
    null
  );
}


/* =========================================================
   CLIENT PAYLOAD
========================================================= */

function cleanClient(
  client = {}
) {
  const output = {};


  if (
    client.name !==
    undefined
  ) {
    output.name =
      client.name ||
      null;
  }


  if (
    client.country !==
    undefined
  ) {
    output.country =
      client.country ||
      null;
  }


  if (
    client.notes !==
    undefined
  ) {
    output.notes =
      client.notes ||
      null;
  }


  if (
    client.cj_client_order !==
    undefined
  ) {
    const order =
      client.cj_client_order ===
        "" ||
      client.cj_client_order ===
        null
        ? null
        : Number(
            client.cj_client_order
          );


    if (
      order !== null &&
      ![1, 2, 3]
        .includes(order)
    ) {
      throw new Error(
        "cj_client_order must be 1, 2, 3, or null"
      );
    }


    output.cj_client_order =
      order;
  }


  return output;
}


/* =========================================================
   SITE PAYLOAD
========================================================= */

function cleanSite(
  site = {}
) {
  const output = {};


  if (
    site.client_id !==
    undefined
  ) {
    output.client_id =
      site.client_id === "" ||
      site.client_id === null
        ? null
        : Number(
            site.client_id
          );
  }


  if (
    site.name !==
    undefined
  ) {
    output.name =
      site.name ||
      null;
  }


  if (
    site.country !==
    undefined
  ) {
    output.country =
      site.country ||
      null;
  }


  if (
    site.city !==
    undefined
  ) {
    output.city =
      site.city ||
      null;
  }


  if (
    site.area !==
    undefined
  ) {
    output.area =
      site.area ||
      null;
  }


  if (
    site.address !==
    undefined
  ) {
    output.address =
      site.address ||
      null;
  }


  if (
    site.status !==
    undefined
  ) {
    output.status =
      site.status ||
      null;
  }


  const latitude =
    site.latitude ??
    site.lat;


  const longitude =
    site.longitude ??
    site.lng;


  if (
    latitude !==
    undefined
  ) {
    output.latitude =
      numberOrNull(
        latitude
      );
  }


  if (
    longitude !==
    undefined
  ) {
    output.longitude =
      numberOrNull(
        longitude
      );
  }


  if (
    site.has_4dx !==
    undefined
  ) {
    output.has_4dx =
      Boolean(
        site.has_4dx
      );
  }


  if (
    site.has_screenx !==
    undefined
  ) {
    output.has_screenx =
      Boolean(
        site.has_screenx
      );
  }


  if (
    site.has_ultra4dx !==
    undefined
  ) {
    output.has_ultra4dx =
      Boolean(
        site.has_ultra4dx
      );
  }


  if (
    site.has_imax !==
    undefined
  ) {
    output.has_imax =
      Boolean(
        site.has_imax
      );
  }


  if (
    site.other_formats !==
    undefined
  ) {
    output.other_formats =
      site.other_formats ||
      null;
  }


  if (
    site.notes !==
    undefined
  ) {
    output.notes =
      site.notes ||
      null;
  }


  if (
    site.source !==
    undefined
  ) {
    output.source =
      site.source ||
      null;
  }


  return output;
}


/* =========================================================
   HANDLER
========================================================= */

module.exports =
async function handler(
  req,
  res
) {
  try {

    /* =====================================================
       GET
    ===================================================== */

    if (
      req.method ===
      "GET"
    ) {
      const action =
        req.query?.action ||
        "list";


      if (
        action ===
        "master"
      ) {
        const data =
          await master();


        return json(
          res,
          200,
          {
            ok: true,
            ...data,
          }
        );
      }


      if (
        action ===
        "list"
      ) {
        const projects =
          await listProjects();


        return json(
          res,
          200,
          {
            ok: true,
            projects,
          }
        );
      }


      return json(
        res,
        400,
        {
          ok: false,

          error:
            `Unknown GET action: ${action}`,
        }
      );
    }


    /* =====================================================
       POST ONLY BELOW
    ===================================================== */

    if (
      req.method !==
      "POST"
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
            req.body ||
            "{}"
          )
        : req.body ||
          {};


    const action =
      body.action;


    /* =====================================================
       PROJECT CREATE
    ===================================================== */

    if (
      action ===
      "create"
    ) {
      const payload =
        cleanProject(
          body.project ||
          body.data ||
          {}
        );


      const rows =
        await sb(
          "projects",
          {
            method:
              "POST",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );


      const project =
        rows?.[0] ||
        null;


      if (project) {
        await createHistory(
          project.id,
          {
            change_type:
              "Created",

            title:
              "Project created",

            source:
              "System",
          }
        )
          .catch(
            () =>
              null
          );
      }


      return json(
        res,
        200,
        {
          ok: true,
          project,
        }
      );
    }


    /* =====================================================
       PROJECT UPDATE
    ===================================================== */

    if (
      action ===
      "update"
    ) {
      const id =
        Number(
          body.id
        );


      if (!id) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "Project id is required",
          }
        );
      }


      const before =
        await oneProject(
          id
        );


      if (!before) {
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


      const payload =
        cleanProject(
          body.project ||
          body.data ||
          {}
        );


      const rows =
        await sb(
          `projects?id=eq.${q(id)}`,
          {
            method:
              "PATCH",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );


      return json(
        res,
        200,
        {
          ok: true,

          project:
            rows?.[0] ||
            null,
        }
      );
    }


    /* =====================================================
       PROJECT DELETE
    ===================================================== */

    if (
      action ===
        "delete" ||
      action ===
        "project_delete"
    ) {
      const id =
        Number(
          body.id
        );


      if (!id) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "Project id is required",
          }
        );
      }


      await sb(
        `project_history?project_id=eq.${q(id)}`,
        {
          method:
            "DELETE",

          headers: {
            Prefer:
              "return=minimal",
          },
        }
      )
        .catch(
          () =>
            null
        );


      await sb(
        `projects?id=eq.${q(id)}`,
        {
          method:
            "DELETE",

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
          deleted_id:
            id,
        }
      );
    }


    /* =====================================================
       HISTORY CREATE
    ===================================================== */

    if (
      action ===
      "history_create"
    ) {
      const projectId =
        Number(
          body.project_id ||
          body.history
            ?.project_id
        );


      if (!projectId) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "project_id is required",
          }
        );
      }


      const history =
        await createHistory(
          projectId,
          body.history ||
          {}
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


    /* =====================================================
       HISTORY UPDATE
    ===================================================== */

    if (
      action ===
      "history_update"
    ) {
      const id =
        Number(
          body.id
        );


      if (!id) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "History id is required",
          }
        );
      }


      const source =
        body.history ||
        {};


      const allowed = [
        "event_date",
        "change_type",
        "title",
        "before_value",
        "after_value",
        "note",
        "source",
      ];


      const payload = {};


      for (
        const key
        of allowed
      ) {
        if (
          Object.prototype
            .hasOwnProperty
            .call(
              source,
              key
            )
        ) {
          payload[key] =
            source[key] ===
            ""
              ? null
              : source[key];
        }
      }


      const rows =
        await sb(
          `project_history?id=eq.${q(id)}`,
          {
            method:
              "PATCH",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                payload
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


    /* =====================================================
       HISTORY DELETE
    ===================================================== */

    if (
      action ===
      "history_delete"
    ) {
      const id =
        Number(
          body.id
        );


      if (!id) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "History id is required",
          }
        );
      }


      await sb(
        `project_history?id=eq.${q(id)}`,
        {
          method:
            "DELETE",

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
          deleted_id:
            id,
        }
      );
    }


    /* =====================================================
       CLIENT CREATE
    ===================================================== */

    if (
      action ===
      "client_create"
    ) {
      const payload =
        cleanClient(
          body.client ||
          body.data ||
          {}
        );


      if (
        !payload.name
      ) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "Client name is required",
          }
        );
      }


      const rows =
        await sb(
          "clients",
          {
            method:
              "POST",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );


      return json(
        res,
        200,
        {
          ok: true,

          client:
            rows?.[0] ||
            null,
        }
      );
    }


    /* =====================================================
       CLIENT UPDATE
    ===================================================== */

    if (
      action ===
      "client_update"
    ) {
      const id =
        Number(
          body.id
        );


      if (!id) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "Client id is required",
          }
        );
      }


      const payload =
        cleanClient(
          body.client ||
          body.data ||
          {}
        );


      const rows =
        await sb(
          `clients?id=eq.${q(id)}`,
          {
            method:
              "PATCH",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );


      return json(
        res,
        200,
        {
          ok: true,

          client:
            rows?.[0] ||
            null,
        }
      );
    }


    /* =====================================================
       SITE CREATE
    ===================================================== */

    if (
      action ===
        "site_create" ||
      action ===
        "create_site"
    ) {
      const payload =
        cleanSite(
          body.site ||
          body.data ||
          {}
        );


      if (
        !payload.name
      ) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "Site name is required",
          }
        );
      }


      const rows =
        await sb(
          "sites",
          {
            method:
              "POST",

            headers: {
              Prefer:
                "return=representation",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );


      return json(
        res,
        200,
        {
          ok: true,

          site:
            rows?.[0] ||
            null,
        }
      );
    }


    /* =====================================================
       SITE UPDATE
       - PATCH 후 실제 DB 재조회
       - 좌표 저장값까지 검증
    ===================================================== */

    if (
      action ===
        "site_update" ||
      action ===
        "update_site"
    ) {
      const id =
        Number(
          body.id
        );


      if (!id) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "Site id is required",
          }
        );
      }


      const payload =
        cleanSite(
          body.site ||
          body.data ||
          {}
        );


      if (
        !Object.keys(
          payload
        ).length
      ) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "No site fields to update",
          }
        );
      }


      /*
       * STEP 1
       * 실제 DB 행이 존재하는지 먼저 확인
       */
      const beforeRows =
        await sb(
          `sites?id=eq.${q(id)}&select=*`
        );


      const beforeSite =
        Array.isArray(
          beforeRows
        )
          ? beforeRows[0] ||
            null
          : null;


      if (!beforeSite) {
        return json(
          res,
          404,
          {
            ok: false,

            error:
              `Site ${id} not found`,
          }
        );
      }


      /*
       * STEP 2
       * Supabase PATCH
       *
       * PATCH 응답값에 의존하지 않고
       * 아래 STEP 3에서 DB를 다시 읽는다.
       */
      await sb(
        `sites?id=eq.${q(id)}`,
        {
          method:
            "PATCH",

          headers: {
            Prefer:
              "return=minimal",
          },

          body:
            JSON.stringify(
              payload
            ),
        }
      );


      /*
       * STEP 3
       * PATCH 직후 같은 ID를 다시 SELECT
       */
      const verifyRows =
        await sb(
          `sites?id=eq.${q(id)}&select=*`
        );


      const savedSite =
        Array.isArray(
          verifyRows
        )
          ? verifyRows[0] ||
            null
          : null;


      if (!savedSite) {
        return json(
          res,
          500,
          {
            ok: false,

            error:
              `Site ${id} update verification failed: row not found after PATCH`,
          }
        );
      }


      /*
       * STEP 4
       * latitude가 요청에 포함됐으면
       * 실제 저장값과 비교
       */
      if (
        payload.latitude !==
        undefined
      ) {
        const requestedLat =
          Number(
            payload.latitude
          );


        const savedLat =
          savedSite.latitude ===
            null ||
          savedSite.latitude ===
            undefined
            ? null
            : Number(
                savedSite.latitude
              );


        const latOK =
          Number.isFinite(
            requestedLat
          ) &&
          Number.isFinite(
            savedLat
          ) &&
          Math.abs(
            requestedLat -
            savedLat
          ) <
            0.000001;


        if (!latOK) {
          return json(
            res,
            500,
            {
              ok: false,

              error:
                `Site ${id} latitude verification failed`,

              requested: {
                latitude:
                  payload.latitude,
              },

              saved: {
                latitude:
                  savedSite.latitude ??
                  null,
              },
            }
          );
        }
      }


      /*
       * STEP 5
       * longitude가 요청에 포함됐으면
       * 실제 저장값과 비교
       */
      if (
        payload.longitude !==
        undefined
      ) {
        const requestedLng =
          Number(
            payload.longitude
          );


        const savedLng =
          savedSite.longitude ===
            null ||
          savedSite.longitude ===
            undefined
            ? null
            : Number(
                savedSite.longitude
              );


        const lngOK =
          Number.isFinite(
            requestedLng
          ) &&
          Number.isFinite(
            savedLng
          ) &&
          Math.abs(
            requestedLng -
            savedLng
          ) <
            0.000001;


        if (!lngOK) {
          return json(
            res,
            500,
            {
              ok: false,

              error:
                `Site ${id} longitude verification failed`,

              requested: {
                longitude:
                  payload.longitude,
              },

              saved: {
                longitude:
                  savedSite.longitude ??
                  null,
              },
            }
          );
        }
      }


      /*
       * STEP 6
       * DB에서 실제로 다시 읽은 행 반환
       */
      return json(
        res,
        200,
        {
          ok: true,

          verified:
            true,

          site:
            savedSite,
        }
      );
    }


    /* =====================================================
       SITE DELETE
    ===================================================== */

    if (
      action ===
      "site_delete"
    ) {
      const id =
        Number(
          body.id
        );


      if (!id) {
        return json(
          res,
          400,
          {
            ok: false,

            error:
              "Site id is required",
          }
        );
      }


      const sites =
        await sb(
          `sites?id=eq.${q(id)}&select=*`
        );


      const site =
        sites?.[0];


      if (!site) {
        return json(
          res,
          404,
          {
            ok: false,

            error:
              "Site not found",
          }
        );
      }


      const linkedProjects =
        await sb(
          `projects?site_id=eq.${q(id)}&select=id,project_name`
        )
          .catch(
            () =>
              []
          );


      if (
        Array.isArray(
          linkedProjects
        ) &&
        linkedProjects.length >
          0
      ) {
        return json(
          res,
          409,
          {
            ok: false,

            error:
              `Cannot delete this Site because ${linkedProjects.length} Project(s) are linked to it.`,

            linked_projects:
              linkedProjects,
          }
        );
      }


      await sb(
        `sites?id=eq.${q(id)}`,
        {
          method:
            "DELETE",

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

          deleted_id:
            id,

          deleted_name:
            siteName(
              site
            ),
        }
      );
    }


    /* =====================================================
       UNKNOWN ACTION
    ===================================================== */

    return json(
      res,
      400,
      {
        ok: false,

        error:
          `Unknown action: ${action}`,
      }
    );

  } catch (error) {
    console.error(
      error
    );


    return json(
      res,
      500,
      {
        ok: false,

        error:
          error?.message ||
          String(error),
      }
    );
  }
};
