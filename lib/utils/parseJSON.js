// Parsing JSON
const parseJSON = (req, res, next) => {
  // This is only good for bodies that their size is less than the highWaterMark value

  function isJSON(contentType = "") {
    // Remove any params like "; charset=UTF-8"
    const [type] = contentType.split(";");
    return (
      type.trim().toLowerCase() === "application/json" ||
      /\+json$/i.test(type.trim())
    );
  }

  if (!isJSON(req.headers["content-type"])) return next();

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString("utf-8");
  });

  req.on("end", () => {
    body = JSON.parse(body);
    req.body = body;
    return next();
  });
};

export { parseJSON };
