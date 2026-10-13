import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

function client(){
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export function isR2Configured(){
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}

// e.g. newObjectKey('id-photos') -> 'id-photos/3f2a1c9e-....jpg'
export function newObjectKey(prefix){
  return prefix + '/' + crypto.randomUUID() + '.jpg';
}

export async function uploadToR2(key, buffer, contentType){
  await client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'image/jpeg',
  }));
  return key;
}

// Returns { buffer, contentType }, or null if the object doesn't exist.
export async function fetchFromR2(key){
  try{
    const result = await client().send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }));
    const chunks = [];
    for await (const chunk of result.Body) chunks.push(chunk);
    return { buffer: Buffer.concat(chunks), contentType: result.ContentType || 'image/jpeg' };
  }catch(err){
    if (err.name === 'NoSuchKey') return null;
    throw err;
  }
}

export async function deleteFromR2(key){
  try{
    await client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
  }catch(err){
    console.error('deleteFromR2 failed for', key, err);
  }
}
