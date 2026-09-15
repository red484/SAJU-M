import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class JournalConflictError extends Error {}

export class FileJournalRepository {
  constructor(root) {
    this.root = root;
  }

  path(id) {
    return join(this.root, `${id}.json`);
  }

  async ensure() {
    await mkdir(this.root, { recursive: true });
  }

  async get(id) {
    await this.ensure();
    try {
      const row = JSON.parse(await readFile(this.path(id), 'utf8'));
      return { data: row.payload, revision: row.revision || 0 };
    } catch (error) {
      if (error.code === 'ENOENT') return { data: null, revision: 0 };
      throw error;
    }
  }

  async delete(id) {
    await this.ensure();
    await rm(this.path(id), { force: true });
  }

  async put(id, data, revision) {
    await this.ensure();
    let current = null;
    try {
      current = JSON.parse(await readFile(this.path(id), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if ((revision === 0 && current) || (revision > 0 && (!current || current.revision !== revision))) {
      throw new JournalConflictError('Journal revision conflict');
    }
    const next = { payload: data, revision: revision + 1, updated_at: new Date().toISOString() };
    const target = this.path(id);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(next));
    await rename(temporary, target);
    return { revision: next.revision };
  }
}
