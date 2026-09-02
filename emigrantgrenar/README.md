# Emigrantgrenar

Varje emigrantgren har en egen masterfil. Rotpersonen ska redan finnas i
webbplatsens centrala persondata och kopplas med sitt stabila `person_id`.
Masterfilen ska inte skapa en kopia av rotpersonen.

Emigrantgrenens efterkommande, familjer, resor, amerikanska platser, källor och
öppna frågor hålls här för att huvudträdet ska förbli överskådligt.

## Filnamn

Använd samma slug som emigrantsidan:

```text
emigrantgrenar/nils-johan-bengtsson.md
```

## Grundstruktur

```markdown
---
person_id: stabilt_person_id
slug: personens-url-slug
destination: land
status: pågående
---

# Personens emigrantgren

## Sammanfattning
## Emigration och resa
## Livet i det nya landet
## Familj och efterkommande
## Tidslinje
## Platser
## Källor
## Motstridiga uppgifter
## Öppna forskningsfrågor
```

Uppgifter från originalhandlingar, familjeanteckningar, sekundära källor och
hypoteser ska hållas tydligt åtskilda.
