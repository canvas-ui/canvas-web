import type { Backend } from '../services/workspace'

export interface BackendUploadTarget {
  driver: string
  address: string
  key: string
}

function validSegments(value: string): boolean {
  return !/[\\\0]/.test(value) && value.split('/').every(part => part !== '.' && part !== '..')
}

/** Resolve only against server-advertised roots and upload capabilities. */
export function backendUploadTarget(path: string, backends: Backend[]): BackendUploadTarget {
  if (!validSegments(path)) throw new Error('Invalid backend folder path')
  const clean = '/' + path.split('/').filter(Boolean).join('/')
  const backend = [...backends]
    .filter(b => b.treePath && (clean === b.treePath || clean.startsWith(b.treePath + '/')))
    .sort((a, b) => b.treePath!.length - a.treePath!.length)[0]
  if (!backend) throw new Error('Choose a writable storage backend folder')
  if (!backend.enabled || backend.config?.readOnly === true || !backend.capabilities.upload) {
    throw new Error('This backend does not support file uploads or is read-only')
  }
  return { driver: backend.driver, address: backend.address, key: clean.slice(backend.treePath!.length).replace(/^\//, '') }
}

export function backendUploadKey(folder: string, filename: string): string {
  if (!filename || filename.includes('/') || !validSegments(filename) || !validSegments(folder)) {
    throw new Error('Invalid upload filename or folder')
  }
  return [folder.replace(/^\/+|\/+$/g, ''), filename].filter(Boolean).join('/')
}
