## Imports

```js
require("dotenv").config();
```

- `require("dotenv")` loads the `dotenv` package.
- `.config()` tells dotenv to read your `.env` file and load those values into `process.env`.
- That is why later you can use things like `process.env.MONGO_URI` and `process.env.AWS_REGION`.

```js
const express = require("express");
```

- This imports the Express library.  
- Express helps you create a server and define routes like `GET /` and `POST /upload`. 

```js
const mongoose = require("mongoose");
```

- This imports Mongoose.  
- Mongoose helps your Node app connect to MongoDB and work with collections using models like `Image`. 

```js
const multer = require("multer");
```

- This imports Multer.  
- Multer is middleware for handling `multipart/form-data`, which is the format Postman uses when sending files.

```js
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
```

- This imports two things from the AWS S3 SDK:
  - `S3Client` = the object that knows how to talk to S3.
  - `PutObjectCommand` = the command used to upload one file/object to S3.

```js
const Image = require("./models/Image");
```

- This imports your Mongoose model from `models/Image.js`.  
- That model is the blueprint for what gets stored in MongoDB, such as `url` and `originalName`. 

```js
const { randomUUID } = require("crypto");
```

- This imports `randomUUID` from Node’s built-in `crypto` module.  
- You use it to generate a unique ID so uploaded file names do not clash with each other. 

## App setup

```js
const app = express();
```

- This creates your Express application.  
- Think of `app` as the main server object where you register middleware and routes. 

```js
app.use(express.json());
```

- `app.use(...)` adds middleware to your app.
- `express.json()` tells Express: “If a request body contains JSON, parse it and put it into `req.body`.” 
- In this project, your upload route mainly uses `req.file`, not `req.body`, but this middleware is still useful for other routes you may add later. 

## Multer setup

```js
const upload = multer({ storage: multer.memoryStorage() });
```

- `multer(...)` creates a Multer middleware instance.
- `storage: multer.memoryStorage()` means uploaded files are stored in memory instead of being saved to your local disk first. 
- So when a file is uploaded:
  - file info goes into `req.file`
  - actual file bytes are available in `req.file.buffer` 
- This is a good choice here because you want to immediately send the file to S3 instead of saving it locally first. 

## S3 setup

```js
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
```

- `new S3Client(...)` creates a client object that can communicate with Amazon S3. 
- `region: process.env.AWS_REGION` tells AWS which region your bucket is in, like `us-east-2`. 
- `credentials` contains the IAM access key and secret key from your `.env` file. 
- These credentials let your backend authenticate with AWS and upload files to your bucket. 

## Health check route

```js
app.get("/", (req, res) => {
  res.json({ message: "API is running" });
});
```

- `app.get("/")` creates a GET route for the root URL `/`. 
- `(req, res) => { ... }` is the route handler function:
  - `req` = request object
  - `res` = response object
- `res.json(...)` sends JSON back to the client. 
- This route is just a quick test to confirm your server is alive.

## Upload route

```js
app.post("/upload", upload.single("image"), async (req, res) => {
```

- `app.post("/upload", ...)` creates a POST route at `/upload`.  
- This is the route Postman calls when you send the file. 
- `upload.single("image")` is Multer middleware. 
- It means:
  - expect one uploaded file
  - the field name must be exactly `"image"`  
- So in Postman, the key must be `image`, or `req.file` will be empty. 
- `async` means this function can use `await` for async tasks like uploading to S3 and saving to MongoDB.

```js
  try {
```

- Starts a `try` block.  
- Any error inside can be caught by the `catch` block below.

```js
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
```

- `req.file` is added by Multer after the upload is processed. 
- `if (!req.file)` means “if no file was received.”  
- `res.status(400)` sets HTTP status code 400, which means bad request.  
- `return` stops the function immediately so the rest of the upload logic does not run.

```js
    const fileName = `${randomUUID()}-${req.file.originalname}`;
```

- Creates a unique file name for S3.
- `randomUUID()` generates something like `f42e8e08-8c8f-409e-8f09-5af7fc8c9b34`. 
- `req.file.originalname` is the original uploaded file name from Postman. 
- Combining them gives you a name like:
  - `f42e8e08-...-photo.jpg`
- This avoids overwriting files if two uploads have the same original name.

```js
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };
```

- This creates the configuration object for the S3 upload command. 
- `Bucket` = the S3 bucket name from `.env`.
- `Key` = the file name you want S3 to save under.
- `Body` = the actual file content. Since Multer uses memory storage, the file bytes are in `req.file.buffer`.
- `ContentType` = MIME type of the uploaded file, such as `image/jpeg` or `image/webp`.
- This helps S3 know what type of file it is.

```js
    await s3.send(new PutObjectCommand(params));
```

- `new PutObjectCommand(params)` creates the upload command for S3. 
- `s3.send(...)` sends that command to AWS. 
- `await` pauses the function until the upload finishes.
- If the upload fails, execution jumps to the `catch` block.

```js
    const url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
```

- This manually builds the public-style URL of the uploaded object.
- It uses:
  - bucket name
  - region
  - file name
- Example:
  - `https://your-bucket.s3.us-east-2.amazonaws.com/abc-photo.jpg`
- This is the link you later save in MongoDB. 

Important note: the URL format can be correct even if the image is not publicly viewable; whether it opens in a browser depends on your S3 permissions. 

```js
    const image = await Image.create({
      url,
      originalName: req.file.originalname,
    });
```

- `Image.create(...)` uses your Mongoose model to create and save a new MongoDB document.  
- The document contains:
  - `url` = S3 image URL
  - `originalName` = original file name
- `await` waits until MongoDB finishes saving it.
- The saved document is returned and stored in the `image` variable.

So at this point:
1. File is uploaded to S3.
2. URL is created.
3. URL is saved to MongoDB. 

```js
    res.status(201).json({
      message: "Upload successful",
      image,
    });
```

- Sends a success response back to Postman.
- `201` means “Created,” which is the correct status when a new resource is created.
- The JSON includes:
  - a message
  - the saved MongoDB document

That is why Postman showed the `url`, `_id`, `createdAt`, and `updatedAt` values. 

```js
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Upload failed",
      error: error.message,
    });
  }
```

- `catch` runs if anything in the `try` block fails.
- `console.error(error)` prints the full error in your terminal for debugging.
- `res.status(500)` sends a server error response.
- `error.message` gives the short error message, such as permission or bucket issues.

## Get all images

```js
app.get("/images", async (req, res) => {
```

- Creates a GET route at `/images`.
- This route is used to fetch all stored image records from MongoDB.

```js
  try {
    const images = await Image.find().sort({ createdAt: -1 });
    res.json(images);
```

- `Image.find()` fetches all documents from the `images` collection.
- `.sort({ createdAt: -1 })` sorts them by newest first.
  - `-1` means descending order.
- `res.json(images)` sends the array back to the client.

```js
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
```

- If the database query fails, this sends a 500 error with the message.

## Get one image by id

```js
app.get("/images/:id", async (req, res) => {
```

- Creates a dynamic route.
- `:id` means “this part of the URL is a variable.”
- Example:
  - `/images/69fa4a71bdae00ce61b86f22`

```js
  try {
    const image = await Image.findById(req.params.id);
```

- `req.params.id` gets the `id` value from the URL.
- `Image.findById(...)` searches MongoDB for a document with that `_id`.

```js
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }
```

- If no matching document exists, return a 404 response.
- `404` means the requested resource was not found.

```js
    res.json(image);
```

- If a document is found, send it back as JSON.

```js
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
```

- Handles server or database errors.

## Port and Mongo URI

```js
const PORT = process.env.PORT || 5000;
```

- Reads `PORT` from `.env`.
- If `PORT` does not exist, it falls back to `5000`.
- `|| 5000` means “use 5000 if the left side is missing or falsey.”

```js
const MONGO_URI = process.env.MONGO_URI;
```

- Reads the MongoDB connection string from `.env`.
- This keeps secrets out of your code.

## Connect DB, then start server

```js
mongoose
  .connect(MONGO_URI)
```

- Tries to connect to MongoDB using the URI.
- `connect()` returns a promise.

```js
  .then(() => {
    console.log("MongoDB connected");
```

- If the connection succeeds, this block runs.
- It logs a success message in the terminal.

```js
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
```

- `app.listen(...)` starts the Express server.
- The callback runs once the server is successfully listening.
- This is why you saw `Server listening on port 5000`.

Important idea: you start the server only after MongoDB connects, so your routes are not running before the database is ready. 

```js
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });
```

- If MongoDB connection fails, this block runs.
- It prints the error message in the terminal.
- In that case, the server does not start listening.

## Full flow

Here is the whole request flow in plain English:

1. Postman sends `POST /upload` with a file in the `image` field.
2. Multer reads the uploaded file and puts it in `req.file`, including `req.file.buffer`. 
3. Your code creates a unique file name.
4. The S3 client uploads the file buffer to S3 with `PutObjectCommand`. 
5. Your code builds the S3 URL.
6. Mongoose saves that URL and original file name in MongoDB.
7. Express sends the saved document back in the response. 
