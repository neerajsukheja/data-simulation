const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(cors());

const appSpecDir = path.join(path.dirname(__dirname), "api_specifications");
// Load the API specification dynamically based on the application name
const loadApiSpec = (appName) => {
  const specPath = path.join(appSpecDir, `${appName}.json`);
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

app.post("/api/create-application", (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Application name is required." });
  }
  const fileName = `${name}.json`;
  const filePath = path.join(appSpecDir, fileName);
  // Check if the file already exists
  if (fs.existsSync(filePath)) {
    return res.status(400).json({ error: "Application already present." });
  }
  // Create the file with an empty JSON object
  fs.writeFile(filePath, JSON.stringify({}, null, 2), (err) => {
    if (err) {
      return res.status(500).json({ error: "Error creating the file." });
    }
    res.status(201).json({ message: "Application file created successfully." });
  });
});

// Endpoint to list all application files
app.get("/api/list-application", (req, res) => {
  fs.readdir(appSpecDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Error reading the directory." });
    }
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    res.status(200).json(jsonFiles);
  });
});

// Endpoint to edit an existing application file
app.put("/api/edit-application/:currentFileName", (req, res) => {
  const { currentFileName } = req.params;
  const { name: newFilename } = req.body;
  const currentFilePath = path.join(appSpecDir, `${currentFileName}.json`);
  const newFilePath = path.join(appSpecDir, `${newFilename}.json`);

  // Check if the current file exists
  if (!fs.existsSync(currentFilePath)) {
    return res.status(404).json({ error: "Application not found." });
  }
  // Rename the file
  fs.rename(currentFilePath, newFilePath, (err) => {
    if (err) {
      return res.status(500).json({
        error: "Error updating the application name.",
      });
    }

    return res
      .status(200)
      .json({ message: "Application name updated successfully." });
  });
});

// Endpoint to delete an existing application file
app.delete("/api/delete-application/:name", (req, res) => {
  const { name } = req.params;
  const filePath = path.join(appSpecDir, `${name}.json`);

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Application not found." });
  }

  // Delete the file
  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Error deleting the file." });
    }

    res.status(200).json({ message: "Application file deleted successfully." });
  });
});

// API endpoint to store data
app.post("/api/end-point/:fileName", (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(appSpecDir, `${fileName}.json`);

  const newDataArray = req.body; // Array of new data objects

  // Validate that the incoming data is an array
  if (!Array.isArray(newDataArray) || newDataArray.length === 0) {
    return res.status(400).json({
      error: "Request body should be a non-empty array of data objects.",
    });
  }

  // Check if file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      // File does not exist, return an error
      return res
        .status(404)
        .json({ error: `${fileName} application does not exist.` });
    }

    // If the file exists, read the current data
    fs.readFile(filePath, "utf8", (readErr, data) => {
      if (readErr) {
        return res.status(500).json({ error: "Error reading the file." });
      }

      let jsonData;
      try {
        jsonData = JSON.parse(data); // Parse existing data in the file
      } catch (parseErr) {
        // If JSON is invalid or file is empty, initialize it as an empty array
        jsonData = [];
      }

      // Ensure jsonData is an array
      if (!Array.isArray(jsonData)) {
        jsonData = [];
      }

      let addedCount = 0;
      let duplicateCount = 0;

      // Iterate over the newDataArray and process each object
      newDataArray.forEach((newData) => {
        // Check for duplicates based on uniqueIdentifier, requestUrl, and requestPayload
        const isDuplicate = jsonData.some((entry) => {
          // Check if uniqueIdentifier and requestUrl match
          const isBasicMatch =
            entry.uniqueIdentifier === newData.uniqueIdentifier &&
            entry.requestUrl === newData.requestUrl;

          // Check if any key-value pair in requestPayload matches
          const hasMatchingKeyValue = Object.keys(newData.requestPayload).some(
            (key) => {
              return entry.requestPayload[key] === newData.requestPayload[key];
            }
          );

          return isBasicMatch && hasMatchingKeyValue;
        });

        // If any key-value pair matches, consider it a duplicate
        if (isDuplicate) {
          duplicateCount++;
        } else {
          // If not a duplicate, add it to the jsonData array
          jsonData.push(newData);
          addedCount++;
        }
      });

      // Write the updated jsonData back to the file
      fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (writeErr) => {
        if (writeErr) {
          return res.status(500).json({ error: "Error writing to the file." });
        }

        // Respond with the number of records added and duplicates found
        return res.status(200).json({
          message: `${addedCount} records added successfully. ${duplicateCount} duplicates found.`,
        });
      });
    });
  });
});

// Dynamic route for API handling
app.all("/simulated-data/:appName/*", (req, res) => {
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

const port = 3001;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running at port ${port}`);
});
