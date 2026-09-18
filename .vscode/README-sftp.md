# Uploading with the VS Code SFTP extension

Copy `sftp.sample.json` to `sftp.json` first — the real file is gitignored so
that a password can never reach a commit:

    cp .vscode/sftp.sample.json .vscode/sftp.json

Then check two things before the first upload.

1. **No password is stored in the sample on purpose.** The extension asks for
   it when it connects. Adding `"password": "..."` to your own `sftp.json` is
   fine — that file is gitignored.

2. **`remotePath` may need changing.** It is `/` here. Connect once, look at the
   remote listing, and if the site lives in something like
   `/task.kriviinfotech.com/wwwroot`, put that path in instead. `server.js` has
   to end up directly in the site folder, not one level below it.

3. **`context` is `deploy-payload`.** That is the built app. Only that folder
   gets uploaded — never the source tree. Run `npm run package` first so the
   folder is current.

## Steps

- `npm run package`
- Command palette -> **SFTP: Upload Folder**, pick `deploy-payload`
- Or right-click the `deploy-payload` folder -> **Upload Folder**

`uploadOnSave` is off deliberately: this app has to be rebuilt before anything
is uploaded, so saving a source file and shipping it straight to production
would push something that was never built.

## Faster alternative

It is ~2,200 files, which FTP sends one at a time. If the control panel's File
Manager is available, upload `deploy-payload.zip` (25 MB, one file) and use
Extract — minutes instead of a long crawl:

    npm run deploy:ftp -- --zip-only
