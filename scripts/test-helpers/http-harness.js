export function createReq({
  method = "GET",
  headers = {},
  body,
  query = {},
  url = "/",
  remoteAddress = "127.0.0.1",
} = {}) {
  return {
    method,
    headers,
    body,
    query,
    url,
    socket: { remoteAddress },
    [Symbol.asyncIterator]: async function* () {
      if (typeof body === "string") {
        yield Buffer.from(body);
      }
    },
  };
}

export function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    end(chunk = "") {
      this.body += String(chunk ?? "");
    },
  };
}

export async function invokeJson(handler, reqOptions = {}) {
  const req = createReq(reqOptions);
  const res = createRes();
  await handler(req, res);
  let json = null;
  try {
    json = JSON.parse(res.body || "{}");
  } catch {}
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body,
    json,
  };
}
