export function App() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-stone-100 px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center text-stone-800">
      <img
        src={`${import.meta.env.BASE_URL}icon-192.png`}
        alt=""
        className="h-24 w-24 rounded-3xl shadow-md"
      />
      <h1 className="text-3xl font-bold">Vorrat</h1>
      <p className="max-w-xs text-stone-600">
        Dein virtueller Vorratsschrank ist bald startklar. Das Fundament steht – als Nächstes kommen
        Vorrat und Einkaufsliste.
      </p>
    </main>
  );
}
