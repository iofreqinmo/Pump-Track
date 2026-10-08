# Setting up the shared family log (Firebase)

Pump Track uses the **same Firebase project as Twin Track**, so Google sign-in and the database are already set up.
The only thing left is one rules change that lets your family read and write the new `pumps` collection. It takes about 2 minutes.

## 1. Let the family use Pump Track
1. Go to https://console.firebase.google.com, sign in, and open the **twin-track** project.
2. Left menu: **Build → Firestore Database**, then open the **Rules** tab.
3. Add this block next to the existing `match /events/{eventId}` block, inside `match /databases/{database}/documents { ... }`:

   ```
   match /pumps/{pumpId} {
     allow read, write: if isFamily();
   }
   ```

   [`firestore.rules`](firestore.rules) shows the complete rules for both apps.
   Keep your real email addresses in the console, and don't copy the placeholder addresses over them.
4. Click **Publish**.

`iofreqinmo.github.io` is already an authorized sign-in domain from Twin Track, so nothing else needs to change.

## 2. Use it
Open the app and tap **Sign in with Google**. If you're already signed in to Twin Track in the same browser, you may be signed in already.
Everyone signed in sees the same pumps within a second or two. Pumps logged with no signal are saved on the phone and upload when it reconnects.

If the app says your account "isn't on the family list", the rules from step 1 haven't been published yet, or the email isn't in the list.

### Signing in the iPhone home-screen app
On iPhone, the home-screen app can't complete Google's sign-in window, and it doesn't share Safari's sign-in. So it signs in with a one-time code instead:
1. Open the app in **Safari** and sign in with Google.
2. Tap **⚙︎ → Sign in the home-screen app**, pick your account again, and tap **Copy code**.
3. Open the home-screen app and tap **Paste code & sign in** (allow the paste when iOS asks).

The code is good for an hour, and the home-screen app stays signed in after that. Each phone only needs to do this once.

## Later: changing the rules for Twin Track
Both apps share one set of rules. When you edit them, keep both the `events` and `pumps` blocks, or the app you left out will stop working.
