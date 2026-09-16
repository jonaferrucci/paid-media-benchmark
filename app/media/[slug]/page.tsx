import { notFound } from "next/navigation";
import { getMediaProfile } from "@/lib/media/catalog";
import { MediaProfileView } from "./MediaProfileView";

export default async function MediaProfilePage({ params }: { params: { slug: string } }) {
  const profile = await getMediaProfile(params.slug);
  if (!profile) notFound();
  return <MediaProfileView profile={profile} />;
}
