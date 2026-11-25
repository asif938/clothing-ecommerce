import { PageSkeleton } from "../../components/skeletons";

/** Shown at once on navigation to any page without its own skeleton (home, CMS pages). */
export default function Loading() {
  return <PageSkeleton />;
}
