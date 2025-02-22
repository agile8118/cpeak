export const cors = (options = {}) => {
  const defaultOptions = {
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: false,
  };

  const corsOptions = { ...defaultOptions, ...options };

  return (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", corsOptions.origin);

    if (corsOptions.credentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", corsOptions.methods);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Max-Age", "86400");

      if (!corsOptions.preflightContinue) {
        res.statusCode = corsOptions.optionsSuccessStatus;
        return res.end();
      }
    }

    next();
  };
};