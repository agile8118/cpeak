import assert from "node:assert";
import supertest from "supertest";
import cpeak, { cors } from "../lib/index.js";

const PORT = 7543;
const request = supertest(`http://localhost:${PORT}`);

describe("CORS middleware", function () {
  let server;

  before(function (done) {
    server = new cpeak();

    server.beforeEach(
      cors({
        origin: "http://localhost:3000",
        credentials: true,
      })
    );

    server.route("get", "/test-cors", (req, res) => {
      res.status(200).json({ message: "CORS test successful" });
    });

    server.listen(PORT, done);
  });

  after(function (done) {
    server.close(done);
  });

  it("should add CORS headers to the response", async function () {
    const res = await request.get("/test-cors");

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.headers["access-control-allow-origin"],
      "http://localhost:3000"
    );
    assert.strictEqual(res.headers["access-control-allow-credentials"], "true");
  });

  it("should handle OPTIONS requests", async function () {
    const res = await request.options("/test-cors");

    assert.strictEqual(res.status, 204);
    assert.strictEqual(
      res.headers["access-control-allow-origin"],
      "http://localhost:3000"
    );
    assert.strictEqual(
      res.headers["access-control-allow-methods"],
      "GET,HEAD,PUT,PATCH,POST,DELETE"
    );
    assert.strictEqual(
      res.headers["access-control-allow-headers"],
      "Content-Type, Authorization"
    );
  });
});