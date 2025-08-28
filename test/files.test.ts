import assert from "node:assert";
import supertest from "supertest";
import fs from "node:fs/promises";
import cpeak from "../lib/";

import type { CpeakRequest, CpeakResponse, HandleErr } from "../lib/types";

const PORT = 7543;
const request = supertest(`http://localhost:${PORT}`);

describe("Returning files with sendFile", function () {
  let server: cpeak;

  before(function (done) {
    server = new cpeak();

    server.route("get", "/file", (req: CpeakRequest, res: CpeakResponse) => {
      res.status(200).sendFile("./test/files/test.txt", "text/plain");
    });

    server.listen(PORT, done);
  });

  after(function (done) {
    server.close(done);
  });

  it("should get a file as the response with the correct MIME type", async function () {
    const res = await request.get("/file");

    const fileContent = await fs.readFile("./test/files/test.txt", "utf-8");

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers["content-type"], "text/plain");
    assert.strictEqual(res.text, fileContent);
  });
});
