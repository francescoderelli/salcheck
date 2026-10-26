// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,primaryKey,index,check} from 'drizzle-orm/sqlite-core';
export const state=sqliteTable('state',{key:text().primaryKey(),value:text().notNull()});
export const sessions=sqliteTable('sessions',{hash:text().primaryKey(),email:text().notNull(),role:text().notNull(),ownerId:text('owner_id'),expires:integer().notNull()});
export const imports=sqliteTable('imports',{id:text().primaryKey(),source:text().notNull(),owner:text().notNull(),createdAt:text('created_at').notNull(),committedAt:text('committed_at'),expected:integer().notNull(),baseRevision:text('base_revision').notNull()});
export const staged=sqliteTable('staged',{importId:text('import_id').notNull(),key:text().notNull(),ra:text().notNull(),data:text().notNull()},t=>[primaryKey({columns:[t.importId,t.key]})]);
export const current=sqliteTable('current_rows',{key:text().primaryKey(),ra:text().notNull(),data:text().notNull(),importId:text('import_id').notNull()},t=>[index('current_ra').on(t.ra)]);
export const declarations=sqliteTable('declarations',{key:text().primaryKey(),ra:text().notNull(),data:text().notNull(),version:integer().notNull()},t=>[index('declaration_ra').on(t.ra)]);
export const audit=sqliteTable('audit',{id:integer().primaryKey({autoIncrement:true}),at:text().notNull(),actor:text().notNull(),event:text().notNull(),recordKey:text('record_key').notNull(),data:text().notNull()});
export const comparisons=sqliteTable('comparisons',{importId:text('import_id').notNull(),key:text().notNull(),ra:text().notNull(),data:text().notNull()},t=>[primaryKey({columns:[t.importId,t.key]}),index('comparison_ra').on(t.ra)]);
export const guard=sqliteTable('mutation_guard',{id:text().primaryKey(),valid:integer().notNull()},t=>[check('guard_valid',sql`${t.valid}=1`)]);
