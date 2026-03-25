// ── Core Entities ─────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  language: Language;
  isPublic: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  activeUsers?: number;
}

export interface RunJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs?: number;
  language: Language;
  createdAt: string;
}

// ── Auth ──────────────────────────────────────────────────
export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

// ── Rooms ─────────────────────────────────────────────────
export interface CreateRoomInput {
  name: string;
  description?: string;
  language: Language;
  isPublic: boolean;
}

// ── Realtime ──────────────────────────────────────────────
export interface ConnectedUser {
  id: string;
  username: string;
  color: string;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

export interface CursorUpdate {
  userId: string;
  username: string;
  color: string;
  position: CursorPosition;
}

export interface CodeChange {
  content: string;
  userId: string;
}

// ── Languages ─────────────────────────────────────────────
export type Language = 'javascript' | 'typescript' | 'python' | 'cpp' | 'java';

export interface LanguageConfig {
  label: string;
  monacoId: string;
  icon: string;
  extension: string;
  starter: string;
  color: string;
}

export const LANGUAGES: Record<Language, LanguageConfig> = {
  javascript: {
    label: 'JavaScript',
    monacoId: 'javascript',
    icon: '🟨',
    extension: 'js',
    color: '#f7df1e',
    starter: `// Welcome to CodeVerse!
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
`,
  },
  typescript: {
    label: 'TypeScript',
    monacoId: 'typescript',
    icon: '🔷',
    extension: 'ts',
    color: '#3178c6',
    starter: `// Welcome to CodeVerse!
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
`,
  },
  python: {
    label: 'Python',
    monacoId: 'python',
    icon: '🐍',
    extension: 'py',
    color: '#3572A5',
    starter: `# Welcome to CodeVerse!
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("World"))
`,
  },
  cpp: {
    label: 'C++',
    monacoId: 'cpp',
    icon: '⚡',
    extension: 'cpp',
    color: '#f34b7d',
    starter: `// Welcome to CodeVerse!
#include <iostream>
#include <string>

std::string greet(const std::string& name) {
    return "Hello, " + name + "!";
}

int main() {
    std::cout << greet("World") << std::endl;
    return 0;
}
`,
  },
  java: {
    label: 'Java',
    monacoId: 'java',
    icon: '☕',
    extension: 'java',
    color: '#b07219',
    starter: `// Welcome to CodeVerse!
public class Main {
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }

    public static void main(String[] args) {
        System.out.println(greet("World"));
    }
}
`,
  },
};

// ── API Responses ─────────────────────────────────────────
export interface ApiError {
  message: string;
  statusCode?: number;
}

// ── UI ────────────────────────────────────────────────────
export type OutputLine =
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'system'; text: string };