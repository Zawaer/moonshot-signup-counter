# Moonshot Signup Counter

A real-time analytics dashboard for tracking Moonshot signup counts.

![Dashboard Preview](https://img.shields.io/badge/Next.js-15.5-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?style=for-the-badge&logo=tailwindcss)

## Run locally

1. **Clone the repository**
```bash
git clone https://github.com/Zawaer/moonshot-signup-count.git
cd moonshot-signup-count
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up Supabase**
   - Create a new project at [Supabase](https://supabase.com)
   - Create a `signups` table with columns: `id` (int8, primary key), `count` (int8), `timestamp` (timestamptz, default value as now())
   - Enable RLS and realtime for the table
   - Add a policy `Enable read access for all users` for the table
   - Create an edge function and paste the code from `supabase/functions/signup-count.fetcher.ts` into the editor
   - Create a Cron Job for the edge function in `Integrations -> Cron -> Jobs`. Schedule it to run every minute and select the `signup-count-fetcher` edge function as the type. Set the method to `POST`, timeout to `1000ms` and add a HTTP header named `Authorization` with the value `Bearer <your service role key>` and insert the service role key from `Project Settings -> API Keys`. Put `{"name":"Functions"}` to the HTTP request body.

4. **Configure environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

   You can find the project URL in `Project Settings -> Data API` and the anon key in `Project Settings -> API Keys`

5. **Run development server**
```bash
npm run dev
```

Open http://localhost:3000 with your browser.


## License

This project is licensed under the MIT license.
