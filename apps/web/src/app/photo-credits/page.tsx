import photos from "../../../public/catalog/photos/credits.json";

export const metadata = { title: "Product photo credits" };

export default function PhotoCreditsPage() {
  return (
    <div className="container-page space-y-5 py-6">
      <h1 className="text-2xl font-extrabold">Product photo credits</h1>
      <p className="text-sm text-muted">
        Representative product photos from Wikimedia Commons. Varieties and packaging may differ. Photos are
        resized and converted to WebP for fast mobile browsing.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          <li key={photo.slug} className="flex gap-3 rounded-xl border border-line bg-white p-3">
            <img
              src={`/catalog/photos/${photo.slug}.webp`}
              alt={photo.name}
              loading="lazy"
              className="h-16 w-16 rounded-lg object-cover"
            />
            <div className="min-w-0 break-words text-xs">
              <p className="font-bold">{photo.name}</p>
              <p>{photo.author}</p>
              <a href={photo.attributionUrl} className="text-primary-700 underline">
                Original photo
              </a>
              {" · "}
              <a href={photo.licenseUrl || photo.attributionUrl} className="text-primary-700 underline">
                {photo.license}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
