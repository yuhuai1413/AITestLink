import type { ElementType } from "react";

export type Phase =
  | "login"
  | "landing"
  | "subcategory"
  | "interview"
  | "scoring"
  | "result"
  | "summary"
  | "profile"
  | "history"
  | "report"
  | "terms"
  | "privacy";

export type InterviewMode = "practice" | "mock" | "real";

export interface SubCategory {
  id: string;
  name: string;
  desc: string;
  Icon?: ElementType;
}

export interface Category {
  id: string;
  name: string;
  shortDesc: string;
  desc: string;
  Icon: ElementType;
  color: string;
  colorClass: string;
  subcategories: SubCategory[];
}

export interface Question {
  type: string;
  question: string;
  timeLimit: number;
  hint: string;
}

export interface Feedback {
  score: number;
  grade: string;
  gradeColor: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  keyPoints: string[];
}

export interface SessionResult {
  question: Question;
  answer: string;
  feedback: Feedback;
}

export interface Session {
  id: string;
  categoryId: string;
  categoryName: string;
  subcategoryName: string;
  date: Date;
  results: SessionResult[];
}
