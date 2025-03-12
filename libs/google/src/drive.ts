// Google Drive functions
import debug from 'debug';
import { client } from './core';
import oerror from '@overleaf/o-error';
import { stringify } from 'q-i';
// Note these are node-specific @googleapis libraries, but they have the
// typescript typings we need:
import type { drive_v3 as Drive  } from '@googleapis/drive';
import pLimit from 'p-limit';

const warn = debug('af/google#drive:warn');
const info = debug('af/google#drive:info');
const trace = debug('af/google#drive:trace');

// Given a path line /a/b/c, it will find the ID of the folder at that path
// If the path does not exist, it will create it
export async function ensurePath({
  path,
  id='root',
  donotcreate=false,
}: {
  path: string,
  id?: string | null,
  donotcreate?: boolean
}): Promise<{ id: string } | null> {
  if (!path || path.length < 1) { // path is empty, we're done
    trace('path is empty, returning id ', id);
    return id ? {id} : null;
  }
  // If leading slash, this is root:
  if (path[0] === '/') path = path.slice(1); // just get rid of preceding slash since id defaults to 'root'
  const parts = path.split('/');
  const name = parts[0]; // get the top one
  if (!name) {
    trace('after split, name is empty, returning id ', id);
    return id ? {id} : null;
  }
  const rest = parts.slice(1);
  trace('ensurePath: checking for file ',name,' in folder with  id ', id);
  let found = null;
  let founderror = null;
  try {
    found = await findFileInFolder({id,name});
  } catch(e: any) {
    founderror = e;
    // Did not find it, logic below to handle that case
  }

  if (!found) {
    if (donotcreate) {
      warn('WARNING: google.ensurePath: did not find path, and donotcreate=true so we did not create it');
      throw oerror.tag(founderror, `af/google#drive/ensurePath: did not find path, and donotcreate was true so we did not create it.`);
    }
    // Create this part of the path if it doesn't exist
    info('ensurePath: creating folder ', name, ' in parent id ', id);
    const result = await createFolder({name, parentid: id==='root' ? null : id,});
    return ensurePath({
      path: rest.join('/'),
      id: result?.id,
      donotcreate,
    });
  }
  trace('google.ensurePath: found ',name,', going down rest of path ',rest.join('/'));
  // Is this a shortcut instead of an actual folder?  If so, we need the ID of the target, not the ID of the shortcut
  let nextid = found.id;
  if (found.mimeType === 'application/vnd.google-apps.shortcut') {
    nextid = found.shortcutDetails?.targetId || nextid;
    trace(name, ' is a shortcut, using targetId: ', nextid, ', and this is the entire file object: ', found);
  } else {
    trace(name, ' is a regular folder/file, using id: ', nextid);
  }
  return ensurePath({
    path: rest.join('/'),
    id: nextid,
    donotcreate,
  });
};


// Given a path, find it's ID:
export async function idFromPath({path}: {path: string}): Promise<{ id: string }> {
  let result = null;
  try {
    result = await ensurePath({path,donotcreate: true});
  } catch(e:any) {
    throw oerror.tag(e, `af/google#drive/idFromPath: Could not find file at path ${path}`);
  }
  if (!result || !result.id) throw new Error(`af/google#drive/idFromPath: Could not find file at path ${path}, result was ${result}`);
  return {id:result.id};
}

// Create a file in
export async function createFile({
  parentid=null,
  name,
  mimeType
}: {
  parentid?: string | null | false,
  name: string,
  mimeType: string
}): Promise<{ id: string } | null> {
  try {
    const c = await client();
    const res = await c.drive.files.create({
      resource: {
        name,
        mimeType,
        parents: parentid ? [parentid] : [],
      },
      fields: 'id',
    });
    const file = res?.result;
    if (!file?.id) return null;
    return { id: file.id };
  } catch(e) {
    warn('ERROR: createFile: failed to create file ', name, '.  Error was: ', e);
    throw oerror.tag(e as Error, 'createFile: failed to create file.');
  }
}

export function createFolder({parentid=null,name}: { parentid?: string | null, name: string}) {
  return createFile({parentid,name,mimeType: 'application/vnd.google-apps.folder'});
}

export async function findFileInFolder(
  {id,name}:
  { id: string | null, name: string}
): Promise<Drive.Schema$File | null> {
  if (!id) return null;
  let res;
  const c = await client();
  try {
    res = await c.drive.files.list({
      q: `name='${name}' and trashed=false and '${id}' in parents`,
      //fileId: id,
      spaces: 'drive',
      fields: 'files(id,name,kind,mimeType,shortcutDetails)',
    });
  } catch(e) {
    try {
      res = await c.drive.files.list({
        q: `'${id}' in parents`,
        spaces: 'drive',
        fields: 'files(id,name,kind,mimeType,shortcutDetails)',
      });
      const allfiles = (res?.result as Drive.Schema$FileList)?.files;
      throw oerror.tag(e as Error, `af/google#findFileInFolder: Failed to find file with name ${name} and has parent id ${id}.  All files in parent are: ${stringify(allfiles)}`);
    } catch(e2: any) {
      throw oerror.tag(e2 as Error, `af/google#drive/findFileInFolder: failed to find file with name ${name} and child of id ${id}, and failed to list all available files for that parent`);
    }
  }
  const allfiles = (res?.result as Drive.Schema$FileList)?.files;
  let foundfiles = allfiles;
  if (allfiles && allfiles.length > 1) {
    // Their search is case-insensitve so it will return all matches with same case.
    foundfiles = allfiles.filter(f => f.name === name); // do our own case-sensitive search
    if (foundfiles.length > 1) {
      warn('findFileInFolder: WARNING: Found '+foundfiles.length+' files with name ', name, ': ', foundfiles);
    }
  }
  if (!foundfiles || foundfiles.length < 1 || !foundfiles[0]) {
    trace('findFileInFolder: WARNING: Did not find folder', name, '.  The files returned were: ', allfiles);
    return null;
  }
  return foundfiles[0];
}

export async function getToken(): Promise<string> {
//  return (await auth2()).getAuthInstance().currentUser.get().getAuthResponse(true).access_token;
  return (await client()).getToken().access_token;
}

// If you want to download a spreadsheet as an xlsx, pass exportMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
export async function getFileContents({ id, exportMimeType=null }: { id: string, exportMimeType?: null | string }): Promise<ArrayBuffer> {
  // When dealing with binary files, you can't use the client b/c it seems to make things into strings
  // Based on https://stackoverflow.com/questions/61552228/gdrive-api-v3-files-get-download-progress
  return new Promise(async (resolve, reject) => {
    const oauthToken = await getToken();
    const xhr = new XMLHttpRequest();
    let path = `https://www.googleapis.com/drive/v3/files/${id}`;
    if (exportMimeType) {
      // Export (does this work for things other than spreadsheets? slides?)
      path += `/export?mimeType=${exportMimeType}&alt=media`;
    } else {
      // Just download directly.
      path += '?alt=media';
    }
    xhr.open('GET', path);
    xhr.setRequestHeader('Authorization', `Bearer ${oauthToken}`);
    xhr.responseType = 'arraybuffer';
    xhr.onabort = (evt) => {
      reject(new Error(`google#getFileContents: ${id}: download aborted.  evt = ${evt}`));
    };
    xhr.onerror = (evt) => {
      reject(new Error(`google#getFileContents: ${id}: download error, evt = ${evt}`));
    };
    xhr.ontimeout = event => {
      reject(new Error(`drive#getFileContents: Timeout downloading file, event = ${event}`))
    };
    xhr.onload = () => { resolve(xhr.response); };

    xhr.send()
  });
}

export type FileList = { id: string, name: string, kind?: string, mimeType?: string }[];
export async function ls(
  {id,path}:
  { id: string, path?: null } | { path: string, id?: null }
):Promise< { id: string, contents: FileList } | null > {
  if (!id) {
    if (!path) return null;
    const found = await idFromPath({path});
    if (!found || !found.id) {
      trace(`Did not find an id for path `,path);
      return null;
    }
    if (!found.id) return null;
    id = found.id;
  }
  if (!id) return null;

  const c = await client();
  const res = await c.drive.files.list({
    q: `trashed=false and '${id}' in parents`,
    //fileId: id,
    spaces: 'drive',
  });
  const files = (res?.result as Drive.Schema$FileList)?.files;
  if (!files) return { id,  contents: [] };
  const ret = {
    id,
    contents: files.map(f => ({
      id: f.id || '',
      name: f.name || '',
      kind: f.kind || '',
      mimeType: f.mimeType || '',
    })),
  };
  return ret;
}

export async function uploadArrayBuffer(
  { filename, parentid, parentpath, type, buffer }:
  { filename: string, parentid?: string, parentpath?: string, type: string, buffer: ArrayBuffer }
): Promise<{ id: string } | null> {
  if (!parentid) {
    if (!parentpath) throw new Error('uploadArrayBuffer: must pass either a parentpath or a parentid');
    const res = await ensurePath({ path: parentpath });
    if (!res) throw new Error(`uploadArrayBuffer: could not ensure parent path ${parentpath}`);
    parentid = res.id;
  }
  // based on https://stackoverflow.com/questions/52081706/google-drive-api-correct-way-to-upload-binary-files-via-the-multipart-api
  const content = new Blob([ buffer ]);
  const meta = {name: filename, mimeType: type, parents: [ parentid ]};
  const accessToken = await getToken();
  const payload = new FormData();
  payload.append('metadata', new Blob([JSON.stringify(meta)], {type: 'application/json'}));
  payload.append('file', content);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('post', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
    xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
    xhr.onload = function() {
      const result = JSON.parse(xhr.response);
      resolve({id: result.id});
    };
    xhr.onerror = function() {
      warn('ERROR: failed to post as xhr to google.  Response was: ', xhr.response);
      reject(new Error(`ERROR: failed to post as xhr to google.  Response was: ${JSON.stringify(xhr.response,null,'  ')}`));
    };
    xhr.send(payload);
  });
};


export async function copyAllFilesFromFolderToExistingFolder({ sourceFolderid, destinationFolderid }: { sourceFolderid: string, destinationFolderid: string }) {
  const limit = pLimit(5);
  const dir = await ls({ id: sourceFolderid });
  if (!dir) {
    throw new Error('ERROR: could not ls the sourcefolderid '+sourceFolderid);
  }
  let count = 0;
  const queue = dir.contents.map(f => limit(async () => {
    try {
      // Drive has an oddity in ls-ing a folder that it returns a non-existent folder whose name is the part of the parent folder name
      // before any "-".  i.e. if the parent folder is "MUTABLE-ACCOUNTS", it returns one entry with name "MUTABLE".  The "kind" is set to
      // "drive#file", but the mimeType is application/vnd.google-apps.folder.  This function doesn't recursively copy anyway, so we can
      // hack a solution by just ignoring that mimeType
      if (f.mimeType === 'application/vnd.google-apps.folder') return;
      await (await client()).drive.files.copy({ fileId: f.id }, { name: f.name, parents: [ destinationFolderid ] });
    } catch(e: any) {
      info('ERROR: tried to copy file',f,' but copy failed for reason:',e);
      throw new Error('FAIL: could not copy file '+f.name+' from source to destination.  Source directory contents were: '+JSON.stringify(dir.contents)+'.  Error was: '+e.toString());
    }
    count++;
  }));
  await Promise.all(queue);
  info('Copied',count,'files from source to destination folder');
}

export async function rename({ sourceFileid, newFilename }: { sourceFileid: string, newFilename: string }) {
  const c = await client();
  return c.drive.files.update({ fileId: sourceFileid }, { name: newFilename });
}

export async function move({ sourceFileid, sourceFolderid, destinationFolderid }: { sourceFileid: string, sourceFolderid: string, destinationFolderid: string }) {
  const c = await client();
  // @ts-ignore
  return c.drive.files.update({ fileId: sourceFileid, addParents: destinationFolderid, removeParents: sourceFolderid });
}