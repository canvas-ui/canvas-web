import { createContext, useContext } from 'react'
export type TerminalSession = { id: string; cwd: string; running: boolean }
export type TerminalRead = { offset: number; start: number; data: number[]; running: boolean }
export interface TerminalTransport {
  list(scope: string): Promise<TerminalSession[]>
  create(scope: string, cwd?: string): Promise<TerminalSession>
  read(id: string, offset: number): Promise<TerminalRead>
  write(id: string, data: string | Uint8Array): Promise<void>
  resize(id: string, cols: number, rows: number): Promise<void>
  close(id: string): Promise<void>
}
export const TerminalTransportContext = createContext<TerminalTransport | null>(null)
export const useTerminalTransport = () => useContext(TerminalTransportContext)
