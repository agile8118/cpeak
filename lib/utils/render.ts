import fs from "node:fs/promises";
import { frameworkError } from "../";
import type { CpeakRequest, CpeakResponse, Next } from "../types";

function renderTemplate(
  templateStr: string,
  data: Record<string, unknown>
): string {
  // Initialize variables
  let result: (string | unknown)[] = [];

  let currentIndex = 0;

  while (currentIndex < templateStr.length) {
    // Find the next opening placeholder
    const startIdx = templateStr.indexOf("{{", currentIndex);
    if (startIdx === -1) {
      // No more placeholders, push the remaining string
      result.push(templateStr.slice(currentIndex));
      break;
    }

    // Push the part before the placeholder
    result.push(templateStr.slice(currentIndex, startIdx));

    // Find the closing placeholder
    const endIdx = templateStr.indexOf("}}", startIdx);
    if (endIdx === -1) {
      // No closing brace found, treat the rest as plain text
      result.push(templateStr.slice(startIdx));
      break;
    }

    // Extract the variable name
    const varName = templateStr.slice(startIdx + 2, endIdx).trim();

    // Replace the variable with its value from the data, or use an empty string if not found
    const replacement = data[varName] !== undefined ? data[varName] : "";

    // Push the replacement to the result array
    result.push(replacement);

    // Move the index past the current closing placeholder
    currentIndex = endIdx + 2;
  }

  // Join all parts into a final string
  return result.join("");
}

// Errors to return: recommend to not render files larger than 100KB
// To Explore: Doing the operation in C++ and return the data as stream back to the client
// @TODO: remove the file from static map
// @TODO: escape the string to prevent XSS
// @TODO: add another {{{ }}} option to not escape the string
const render = () => {
  return function (req: CpeakRequest, res: CpeakResponse, next: Next): void {
    res.render = async (
      path: string,
      data: Record<string, unknown>,
      mime: string
    ) => {
      // check if mime is specified, if not return an error
      if (!mime) {
        throw frameworkError(
          `MIME type is missing. You called res.render("${path}", ...) but forgot to provide the third "mime" argument.`,
          res.render
        );
      }

      let fileStr = await fs.readFile(path, "utf-8");
      const finalStr = renderTemplate(fileStr, data);
      res.setHeader("Content-Type", mime);
      res.end(finalStr);
    };

    next();
  };
};

export { render };
