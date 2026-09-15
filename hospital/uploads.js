// SCP-Remote: acknowledged, per-file uploads for My Files.
'use strict';
const fs = require('fs').promises;
const path = require('path');
const multiparty = require('multiparty');
const locks = new Map();
function failure(status, code) { return Object.assign(new Error(code), { status, uploadCode: code }); }
async function locked(key, action) {
    const previous = locks.get(key) || Promise.resolve();
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    locks.set(key, pending);
    await previous;
    try { return await action(); }
    finally { release(); if (locks.get(key) === pending) locks.delete(key); }
}
async function sizeOf(directory) {
    let total = 0;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw failure(400, 'invalid_path');
        if (entry.isDirectory()) total += await sizeOf(file);
        else if (entry.isFile()) total += (await fs.stat(file)).size;
    }
    return total;
}
function inside(root, target) {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
async function verifyDirectory(root, directory) {
    if (!inside(root, directory)) throw failure(400, 'invalid_path');
    // Existing server-file folders must not redirect an upload through symlinks/junctions.
    const relative = path.relative(root, directory);
    let current = root;
    for (const part of relative ? relative.split(path.sep) : []) {
        current = path.join(current, part);
        let stat;
        try { stat = await fs.lstat(current); }
        catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw failure(400, 'invalid_path'); throw error; }
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure(400, 'invalid_path');
    }
}
exports.createHandler = function (context) {
    return async function upload(req, res) {
        let temporaryDirectory;
        const staging = path.resolve(context.filesPath, 'tmp');
        try {
            const domain = context.getDomain(req, res);
            if (!domain) return; // The existing IP policy already sent its response.
            const user = req.session && context.getUser(req.session.userid);
            if (!user) throw failure(401, 'session_expired');
            if ((user.siteadmin & 8) === 0 || user.domain !== domain.id || domain.userquota === -1 || domain.userQuota === -1) throw failure(403, 'access_denied');
            if (typeof req.query.link !== 'string') throw failure(400, 'invalid_path');
            const link = req.query.link;
            const destination = context.resolvePath(user, domain, link);
            const quotaRoot = context.resolvePath(user, domain, link.split('/').slice(0, 3).join('/'));
            if (!destination || !quotaRoot) throw failure(403, 'access_denied');
            const filesRoot = path.resolve(context.filesPath);
            // Roots are created when My Files is first listed. An upload must not
            // silently recreate a folder deleted since the user selected it.
            await verifyDirectory(filesRoot, path.resolve(destination.fullpath));
            await fs.mkdir(staging, { recursive: true });
            temporaryDirectory = await fs.mkdtemp(path.join(staging, 'scp-upload-'));
            const form = new multiparty.Form({
                uploadDir: temporaryDirectory,
                maxFilesSize: destination.quota == null ? Number.MAX_SAFE_INTEGER : Math.max(0, destination.quota),
                maxFields: 8,
                maxFieldsSize: 16384
            });
            const parsed = await new Promise((resolve, reject) => form.parse(req, (error, fields, files) => {
                if (error) reject(failure(error.statusCode === 413 ? 413 : 400, error.statusCode === 413 ? 'quota_exceeded' : 'invalid_upload'));
                else resolve({ fields, files });
            }));
            const uploads = Object.values(parsed.files || {}).flat();
            if (uploads.length !== 1 || !parsed.files.files || parsed.files.files.length !== 1) throw failure(400, 'invalid_upload');
            const file = uploads[0];
            const name = file.originalFilename;
            if (typeof name !== 'string' || path.basename(name) !== name || !context.validFilename(name) || /[. ]$|[\x00-\x1f\x7f]/.test(name) || name === '__proto__') throw failure(400, 'invalid_name');
            const tempPath = path.resolve(file.path);
            if (!inside(temporaryDirectory, tempPath)) throw failure(400, 'invalid_upload');
            const target = path.join(destination.fullpath, name);
            const overwrite = parsed.fields.overwrite && parsed.fields.overwrite[0] === '1';
            const lockKey = process.platform === 'win32' ? quotaRoot.fullpath.toLowerCase() : quotaRoot.fullpath;
            await locked(lockKey, async () => {
                if (req.aborted) throw failure(400, 'invalid_upload');
                await verifyDirectory(filesRoot, path.resolve(destination.fullpath));
                let previous = null;
                try { previous = await fs.lstat(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
                if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw failure(409, 'file_exists');
                if (previous && !overwrite) throw failure(409, 'file_exists');
                const total = await sizeOf(quotaRoot.fullpath);
                const projected = total - (previous ? previous.size : 0) + file.size;
                if (destination.quota != null && projected > destination.quota) throw failure(413, 'quota_exceeded');
                // Staging is on the server-files volume. Rename publishes a complete
                // file; a failed replacement leaves the previous file in place.
                if (overwrite) await fs.rename(tempPath, target);
                else {
                    // Exclusive publication also protects against another client creating
                    // the same filename between our existence check and publication.
                    try { await fs.link(tempPath, target); }
                    catch (error) { if (error.code === 'EEXIST') throw failure(409, 'file_exists'); throw error; }
                }
            });
            try { context.changed(user, link.split('/').slice(0, 3).join('/')); } catch (error) { /* The client also requests a fresh tree after acknowledgement. */ }
            res.status(200).json({ ok: true, file: { name, size: file.size, modified: Date.now() }, path: link });
        } catch (error) {
            if (!res.headersSent && !req.aborted) res.status(error.status || 500).json({ ok: false, error: error.uploadCode || 'storage_error' });
        } finally {
            // Only remove the request directory allocated by mkdtemp under our staging root.
            if (temporaryDirectory && inside(staging, temporaryDirectory) && path.basename(temporaryDirectory).startsWith('scp-upload-')) {
                await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
            }
        }
    };
};
