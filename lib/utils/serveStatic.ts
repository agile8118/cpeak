import fs from "node:fs";
import path from "node:path";

import type { StringMap, CpeakRequest, CpeakResponse, Next } from "../types";

const MIME_TYPES: StringMap = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  eot: "application/vnd.ms-fontobject",
  otf: "font/otf",
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2",
};

const serveStatic = (folderPath: string, newMimeTypes?: StringMap) => {
  // For new user defined mime types
  if (newMimeTypes) {
    Object.assign(MIME_TYPES, newMimeTypes);
  }

  function processFolder(folderPath: string, parentFolder: string) {
    const staticFiles: string[] = [];

    // Read the contents of the folder
    const files = fs.readdirSync(folderPath);

    // Loop through the files and subfolders
    for (const file of files) {
      const fullPath = path.join(folderPath, file);

      // Check if it's a directory
      if (fs.statSync(fullPath).isDirectory()) {
        // If it's a directory, recursively process it
        const subfolderFiles = processFolder(fullPath, parentFolder);
        staticFiles.push(...subfolderFiles);
      } else {
        // If it's a file, add it to the array
        const relativePath = path.relative(parentFolder, fullPath);
        const fileExtension = path.extname(file).slice(1);
        if (MIME_TYPES[fileExtension]) staticFiles.push("/" + relativePath);
      }
    }

    return staticFiles;
  }

  const filesArrayToFilesMap = (filesArray: string[]) => {
    const filesMap: Record<string, { path: string; mime: string }> = {};
    for (const file of filesArray) {
      const fileExtension = path.extname(file).slice(1);
      filesMap[file] = {
        path: folderPath + file,
        mime: MIME_TYPES[fileExtension],
      };
    }
    return filesMap;
  };

  // Start processing the folder
  const filesMap = filesArrayToFilesMap(processFolder(folderPath, folderPath));

  return function (req: CpeakRequest, res: CpeakResponse, next: Next) {
    const url = req.url;
    if (typeof url !== "string") return next();

    if (Object.prototype.hasOwnProperty.call(filesMap, url)) {
      const fileRoute = filesMap[url];
      return res.sendFile(fileRoute.path, fileRoute.mime);
    }

    next();
  };
};

export { serveStatic };
