import { getMediaCatalog } from "@/lib/media/catalog";
import { MediaCatalogView } from "./MediaCatalogView";

export default async function PlatformsPage() {
  const catalog = await getMediaCatalog();
  return <MediaCatalogView catalog={catalog} />;
}
