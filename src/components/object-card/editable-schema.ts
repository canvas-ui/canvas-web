import { NOTE_SCHEMA, LINK_SCHEMA, TAB_SCHEMA, TODO_SCHEMA, IDENTITY_SCHEMA } from '@/components/renderers/types'

export function isEditableSchema(schema: string): boolean {
  return schema === NOTE_SCHEMA || schema === LINK_SCHEMA || schema === TAB_SCHEMA
    || schema === TODO_SCHEMA || schema === IDENTITY_SCHEMA
}
