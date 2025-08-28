import assert from "node:assert";
import supertest from "supertest";
import cpeak from "../lib/";

import type { CpeakRequest, CpeakResponse } from "../lib/types";

const PORT = 7543;
const request = supertest(`http://localhost:${PORT}`);

describe("General route logic & URL variables and parameters", function () {
  let server: cpeak;

  before(function (done) {
    server = new cpeak();

    server.route("get", "/hello", (req: CpeakRequest, res: CpeakResponse) => {
      res.status(200).json({ message: "Hello, World!" });
    });

    server.route(
      "get",
      "/document/:title/more/:another/final",
      (req: CpeakRequest, res: CpeakResponse) => {
        const title = req.vars?.title;
        const another = req.vars?.another;
        const params = req.params;

        res.status(200).json({ title, another, params });
      }
    );

    server.listen(PORT, done);
  });

  after(function (done) {
    server.close(done);
  });

  it("should return a simple response with no variables and parameters", async function () {
    const res = await request.get("/hello");
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { message: "Hello, World!" });
  });

  it("should return a 404 for unknown routes", async function () {
    const res = await request.get("/unknown");
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, {
      error: "Cannot GET /unknown",
    });
  });

  it("should return a 404 for not handled methods", async function () {
    const res = await request.patch("/random");
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, {
      error: "Cannot PATCH /random",
    });
  });

  it("should return the correct URL variables and parameters", async function () {
    const expectedResponseBody = {
      title: "some-title",
      another: "thisISsome__more-text",
      params: {
        filter: "comments-date",
        page: "2",
        sortBy: "date-desc",
        tags: JSON.stringify(["nodejs", "express", "url-params"]),
        author: JSON.stringify({ name: "John Doe", id: 123 }),
        isPublished: "true",
        metadata: JSON.stringify({ version: "1.0.0", language: "en" }),
      },
    };

    const res = await request
      .get("/document/some-title/more/thisISsome__more-text/final")
      .query({
        filter: "comments-date",
        page: 2,
        sortBy: "date-desc",
        tags: JSON.stringify(["nodejs", "express", "url-params"]),
        author: JSON.stringify({ name: "John Doe", id: 123 }),
        isPublished: true,
        metadata: JSON.stringify({ version: "1.0.0", language: "en" }),
      });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, expectedResponseBody);
  });
});
