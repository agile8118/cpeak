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
  gif: "image/gif",
  ico: "image/x-icon",
  json: "application/json",
  webmanifest: "application/manifest+json"
};

const serveStatic = (
  folderPath: string,
  options?: { prefix?: string; live?: boolean; newMimeTypes?: StringMap }
) => {
  // For new user defined mime types
  if (options?.newMimeTypes) {
    Object.assign(MIME_TYPES, options?.newMimeTypes);
  }

  const prefix = options?.prefix ?? "";
  const live = options?.live ?? false;

  // This process the folder on every request, which is useful during development when files are changing often.
  // In production, it's better to process the folder once and store the file paths in memory for faster access if file names are not changing often.
  // If file names dynamically change often in production, then live option can be set to true to process the folder on every request, but it may have performance implications.
  if (live) {
    const resolvedFolder = path.resolve(folderPath);

    return async function (req: CpeakRequest, res: CpeakResponse, next: Next) {
      const url = req.url;
      if (typeof url !== "string") return next();

      const pathname = url.split("?")[0];
      const unprefixed = prefix ? pathname.slice(prefix.length) : pathname;
      const filePath = path.join(resolvedFolder, unprefixed);
      const fileExtension = path.extname(filePath).slice(1);
      const mime = MIME_TYPES[fileExtension];

      if (!mime || !filePath.startsWith(resolvedFolder)) return next();

      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (stat?.isFile()) return res.sendFile(filePath, mime);

      next();
    };
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
      filesMap[prefix + file] = {
        path: folderPath + file,
        mime: MIME_TYPES[fileExtension]
      };
    }
    return filesMap;
  };

  // Start processing the folder
  const filesMap = filesArrayToFilesMap(processFolder(folderPath, folderPath));

  return function (req: CpeakRequest, res: CpeakResponse, next: Next) {
    const url = req.url;
    if (typeof url !== "string") return next();

    const pathname = url.split("?")[0];
    if (Object.prototype.hasOwnProperty.call(filesMap, pathname)) {
      const fileRoute = filesMap[pathname];
      return res.sendFile(fileRoute.path, fileRoute.mime);
    }

    next();
  };
};

export { serveStatic };
