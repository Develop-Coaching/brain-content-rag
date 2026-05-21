// Types for the Monthly Workshop Generator

export interface WorkshopConfig {
  title: string;
  subtitle: string;
  themeSlug: string;
  frameworkAreas: string[];
  justification: string;
  seasonalHook: string;
  dateSuggestion: string;
  timeBst: string;
  timeAest: string;
  priceGbp: number;
  priceAud: number;
  format: string;
  durationMinutes: number;
  targetAudience: string;
  avatar: string;
  notFor: string;
  conversionGoal: string;
  monthKey: string; // YYYY-MM
  monthName: string; // e.g. "May 2026"
}

export interface SectionDef {
  id: string;
  name: string;
  templateText: string;
  searchQueries: SearchQuery[];
  maxTokens: number;
  model: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514';
  dependsOn: string[];
  isStatic?: boolean; // brand guidelines - templated, not generated
  sectionPrompt: string; // section-specific generation instructions
}

export interface SearchQuery {
  query: string;
  frameworkFilter?: string;
  topicFilter?: string;
  matchCount: number;
}

export interface BrandValidationResult {
  text: string;
  autoFixes: string[];
  warnings: string[];
}

export interface GeneratedSection {
  id: string;
  name: string;
  content: string;
  autoFixes: string[];
  warnings: string[];
  generationTimeMs: number;
  truncated: boolean;
}

export type LeadMagnetFormat =
  | 'ebook'
  | 'checklist'
  | 'email-course'
  | 'calculator'
  | 'quiz';

export const LEAD_MAGNET_ROTATION: LeadMagnetFormat[] = [
  'ebook',
  'checklist',
  'email-course',
  'calculator',
  'quiz',
];

export interface LeadMagnetConfig {
  format: LeadMagnetFormat;
  title: string;
  slug: string;
  theme: string;
  monthKey: string;
}

export interface LeadMagnetOutput {
  config: LeadMagnetConfig;
  content: string;
  formatNotes: string;
  deliveryNotes: string;
  socialHooks: string;
  emailFiles?: Map<string, string>; // for email-course format
}

export interface GenerationProgress {
  monthKey: string;
  themeSlug: string;
  workshopConfig: WorkshopConfig | null;
  completedSections: string[];
  generatedContent: Record<string, string>;
  leadMagnetDone: boolean;
  startedAt: string;
  lastUpdatedAt: string;
}

export interface WorkshopGeneratorOptions {
  month: Date;
  themeOverride?: string;
  leadMagnetFormatOverride?: LeadMagnetFormat;
  dryRun: boolean;
  force: boolean;
  briefOnly: boolean;
  leadMagnetOnly: boolean;
}

export interface GenerationResult {
  workshopConfig: WorkshopConfig;
  outputPath: string;
  briefLineCount: number;
  sectionCount: number;
  emailCount: number;
  adAngleCount: number;
  reelCount: number;
  leadMagnet: LeadMagnetConfig | null;
  warnings: string[];
  totalTimeMs: number;
}
