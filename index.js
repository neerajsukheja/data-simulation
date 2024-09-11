const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Load the API specification dynamically based on the application name
const loadApiSpec = (appName) => {
  const specPath = path.join(
    __dirname,
    "api_specifications",
    `${appName}.json`
  );
  if (fs.existsSync(specPath)) {
    try {
      return JSON.parse(fs.readFileSync(specPath, "utf-8"));
    } catch (err) {
      console.error(`Error parsing API spec for app ${appName}:`, err);
      throw new Error(`Failed to load API specification for app ${appName}:`);
    }
  } else {
    throw new Error(`API specification not found for application: ${appName}`);
  }
};

// Helper function to find a matching API specification
const findApiSpec = (
  specs,
  requestUrl,
  method,
  uniqueIdentifier,
  requestBody
) => {
  return specs.find((spec) => {
    const urlMatch = spec.requestUrl === requestUrl;
    const methodMatch =
      spec.requestMethod.toUpperCase() === method.toUpperCase();

    // Validate uniqueIdentifier if it's defined in the spec
    const idMatch = spec.uniqueIdentifier
      ? uniqueIdentifier === spec.uniqueIdentifier
      : true;

    // Validate requestPayload if it's defined in the spec
    const payloadMatch = spec.requestPayload
      ? Object.entries(spec.requestPayload).every(
          ([key, value]) => requestBody[key] === value
        )
      : true;

    // All conditions must match
    return urlMatch && methodMatch && idMatch && payloadMatch;
  });
};

// Dynamic route for API handling
app.all("/:appName/*", (req, res) => {
  try {
    const appName = req.params.appName;
    const requestUrl = `/${req.params[0]}`;
    const method = req.method;
    const uniqueIdentifier = req.query.uniqueIdentifier || null; // Graceful handling of undefined/null
    const requestBody = req.body || {}; // Ensure request body is always an object

    // Load the API specification for the application
    let apiSpec;
    try {
      apiSpec = loadApiSpec(appName);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }

    // Find the matching API spec based on URL, method, uniqueIdentifier, and payload
    const matchedSpec = findApiSpec(
      apiSpec,
      requestUrl,
      method,
      uniqueIdentifier,
      requestBody
    );

    // If no spec is found, return a 404 error
    if (!matchedSpec) {
      return res
        .status(404)
        .json({ error: "No matching API specification found" });
    }

    // Return the response as per the matched specification
    res
      .status(matchedSpec.responseStatusCode)
      .type(matchedSpec.responseContentType)
      .send(matchedSpec.responseValue);
  } catch (err) {
    console.error("An unexpected error occurred:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong!" });
});

const port = 3001;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running at port ${port}`);
});
