import { v4 as uuidv4 } from "uuid";

const VISITOR_ID_KEY = "advantix_visitor_id";

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "";
  
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = uuidv4();
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }
  return visitorId;
}
