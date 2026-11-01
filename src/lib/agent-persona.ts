export function buildSystemPrompt(role: string, identity: string, instructions: string) {
  return [
    role.trim() ? `## Role\n${role.trim()}` : '',
    identity.trim() ? `## Identity\n${identity.trim()}` : '',
    instructions.trim() ? `## Instructions\n${instructions.trim()}` : '',
  ].filter(Boolean).join('\n\n')
}
