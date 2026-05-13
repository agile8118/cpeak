import assert from "node:assert";
import supertest from "supertest";
import cpeak, { render } from "../lib/";

import type { Cpeak, CpeakRequest, CpeakResponse } from "../lib/types";

const PORT = 7543;
const request = supertest(`http://localhost:${PORT}`);

describe("Rendering a template with render middleware", function () {
  let server: Cpeak;

  before(function (done) {
    server = cpeak();

    server.beforeEach(render());

    server.route("get", "/", (req: CpeakRequest, res: CpeakResponse) => {
      return res.render(
        `./test/files/index.html`,
        {
          title: "Home",
          body: "Welcome to the Home Page"
        },
        "text/html"
      );
    });

    server.route(
      "get",
      "/inferred",
      (req: CpeakRequest, res: CpeakResponse) => {
        return res.render(`./test/files/index.html`, {
          title: "Home",
          body: "Welcome to the Home Page"
        });
      }
    );

    server.listen(PORT, done);
  });

  after(function (done) {
    server.close(done);
  });

  it("should render the correct the HTML file with the variables correctly injected", async function () {
    const res = await request.get("/");

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] ?? "", /^text\/html\b/);

    assert.ok(res.text.includes("<title>Home</title>"));
    assert.ok(res.text.includes("<p>Welcome to the Home Page</p>"));
  });

  it("should infer the MIME type from the file extension when omitted", async function () {
    const res = await request.get("/inferred");

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] ?? "", /^text\/html\b/);

    assert.ok(res.text.includes("<title>Home</title>"));
    assert.ok(res.text.includes("<p>Welcome to the Home Page</p>"));
  });
});
