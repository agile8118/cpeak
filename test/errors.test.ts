import assert from "node:assert";
import supertest from "supertest";

import cpeak from "../lib/";

import type { CpeakRequest, CpeakResponse, HandleErr } from "../lib/types";

const PORT = 7543;
const request = supertest(`http://localhost:${PORT}`);

describe("Error handling with handleErr", function () {
  let server: cpeak;

  before(function (done) {
    server = new cpeak();

    const mid1 = (
      req: CpeakRequest,
      res: CpeakResponse,
      next: () => void,
      handleErr: HandleErr
    ) => {
      const value = req.params.value;

      if (value === "random")
        return handleErr({ status: 401, message: "another error msg" });

      next();
    };

    server.route(
      "patch",
      "/foo/:bar",
      mid1,
      (req: CpeakRequest, res: CpeakResponse, handleErr: HandleErr) => {
        const bar = req.vars?.bar;

        console.log("-----");
        console.log(bar);

        if (bar === "random") {
          return handleErr({ status: 403, message: "an error msg" });
        }

        return res.status(200).json({ bar });
      }
    );

    server.handleErr((error: any, req: CpeakRequest, res: CpeakResponse) => {
      return res.status(error.status).json({ error: error.message });
    });

    server.listen(PORT, done);
  });

  after(function (done) {
    server.close(done);
  });

  it("should get an error using the handleErr function from a router", async function () {
    const res = await request.patch("/foo/random");
    assert.strictEqual(res.status, 403);
    assert.deepStrictEqual(res.body, { error: "an error msg" });
  });

  it("should get an error using the handleErr function from a middleware", async function () {
    const res = await request.patch("/foo/random?value=random");
    assert.strictEqual(res.status, 401);
    assert.deepStrictEqual(res.body, { error: "another error msg" });
  });
});
