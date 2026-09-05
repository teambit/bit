<p align="center">
  <img src="http://static.bit.dev/bit-docs/readme-bit-logo.png"/>
</p>

<p align="center">
  <a href="https://bit.dev/">Website</a> |
  <a href="https://bit.dev/docs/">Docs</a> |
  <a href="https://bit.cloud/bitdev">Community</a> |
  <a href="https://bit.cloud/">Bit Cloud</a>
</p>

</p>

<h3 align="center">
</h3>

<p align="center">
  
<p align="center">
<a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
<a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
<a href="https://circleci.com/gh/teambit/bit/tree/master"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield">
<a href="https://github.com/prettier/prettier"><img alt ="Styled with Prettier" src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg">
<a href="https://join.slack.com/t/bit-dev-community/shared_invite/zt-1vq1vcxxu-CEVobR1p9BurmW8QnQFh1w" ><img alt="Join Slack" src="https://img.shields.io/badge/Slack-Join%20Bit%20Slack-blueviolet"/></a>

[Bit](https://bit.dev) is the build system to connect components and apps from development to CI in the AI era. Bit organizes source code into composable components, empowering to build reliable, scalable and consistent applications. It enables AI agents to intelligenly create and reuse components via MCP preventing duplication and accelerating development.

⚡ **Features**

- **Reusable components.** Create reusable UI components and modules to reuse across your software.
- **Standard building blocks.** Define the blueprints templates for creating components for devs and AI as one.
- **Shell applications.** Compose reusable components and features into application shells.
- **Atomic and safe deployments.** Ensure simple, safe and optimized deployments of apps and services for testing and production.

Bit supports all tooling in the JS ecosystem and comes out of the box with official dev environments for [NodeJS](https://bit.dev/docs/backend-intro), [React](https://bit.dev/docs/react-intro), [Angular](https://bit.dev/docs/angular-introduction), [Vue](https://bit.dev/docs/vue-intro), [React Native](https://bit.dev/docs/react-native-intro), [NextJS](https://bit.dev/docs/quick-start/hello-world-nextjs) and [far more](https://bit.dev/docs). All are native to TypeScript and ESM and equipped with the best dev tooling.

Bit is a fit to every codebase structure. You can use Bit components in a monorepo, polyrepo, or even without repositories at all.

## Getting started

### Install Bit

Use the Bit installer to install Bit to be available on your PATH.

```bash
npx @teambit/bvm install
```

Initialize Bit on a new folder or in an existing project by running the following command:

```bash
bit init --default-scope my-org.my-project
```

Make sure to [create your scope on the Bit platform](https://bit.cloud/signup) and use the right org and project name. After running the command, Bit is initialized on the chosen directory, and ready to be used via Bit commands, [AI agent, your editor](https://bit.dev/docs/getting-started/installing-bit/editor-setup) or the Bit UI!

### Create shell application

Create the application shell to run, compose and deploy your application:

```bash
bit create react-app corporate-website
```

Run the platform:

```
bit run corporate-website
```

Head to http://localhost:3000 to view your application shell. You can start composing the application layout and specific pages to build your application. Learn more on [building shell applications](https://bit.dev/docs/getting-started/composing/create-apps).

### Compose components

Create the components to compose into the feature. Run the following command to create a new React UI component for the application login route:

```
bit create react pages/login
```

Find simple guides for creating NodeJS modules, UI components and apps, backend services and more on the [Create Component docs](https://bit.dev/docs/getting-started/composing/creating-components/).

Compose the component into the application shell:

```ts
import { Login } from '@my-org/users.pages.login';
import { Routes, Route } from 'react-router-dom';

export function CorporateWebsite() {
  return (
    <AcmeTheme>
      <NavigationProvider>
        <Routes>
          <Route path="/" element={<div>Hello world</div>} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </NavigationProvider>
    </AcmeTheme>
  );
}

```

Head to http://localhost:3000/login to view your new login page.
You can use bit templates to list official templates or find guides for creating React hooks, backend services, NodeJS modules, UI components and more on our [create components docs](https://bit.dev/docs/getting-started/composing/creating-components). Optionally, use bit start to run the Bit UI to preview components in isolation.

### Release and deploy

You can either use hosted scopes on [Bit Cloud](https://bit.cloud) or by [hosting scopes on your own](https://bit.dev/reference/scope/running-a-scope-server). Use the following command to create your Bit Cloud account and your first scope.

```bash
bit login
```

Use semantic versioning to version your components:

```bash
bit tag --message "my first release" --major
```

By default, Bit uses [Ripple CI](https://bit.cloud/products/ripple-ci) to build components. You can use the `--build` flag to build the components on the local machine. To tag and export from your CI of choice to automate the release process or use [our official CI scripts](https://bit.dev/docs/getting-started/collaborate/exporting-components#ci-scripts).

After versioning, you can proceed to release your components:

```bash
bit export
```

### Modernize existing projects

Head over to your [bit.cloud account](https://bit.cloud) to see your components build progress. Once the build process is completed, the components will be available for use using standard package managers:

```bash
npm install @my-org/users.pages.login
```

## Next steps

- [Create more components](https://bit.dev/docs/getting-started/composing/creating-components/)
- [Setup your editor](https://bit.dev/docs/getting-started/installing-bit/editor-setup)
- [Configure CI of choice](https://bit.dev/docs/getting-started/collaborate/exporting-components/#ci-scripts)
- [Start from an existing project](https://bit.dev/docs/getting-started/installing-bit/start-from-existing-project)

## Contributors

Bit is entirely built with Bit and you can find all its components on [Bit Cloud](https://bit.cloud/teambit/~scopes).

<a href="../../graphs/contributors"><img src="https://opencollective.com/bit/contributors.svg?width=890&button=false" /></a>

Your contribution, no matter how big or small, is much appreciated. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License

[Apache License, Version 2.0](https://github.com/teambit/bit/blob/master/LICENSE)


## 🌐 Web Resources & Interactive Index
- [DRAW TO KILL](https://thequizzone.pages.dev/draw-to-kill.html)
- [CRYPTO GALS TIKTOK FASHION](https://learnquester.github.io/crypto-gals-tiktok-fashion.html)
- [FLIGHT PILOT AIRPLANE GAMES 24](https://thelearnquesters.pages.dev/flight-pilot-airplane-games-24.html)
- [BLAST CUBES](https://thelearnquesters.pages.dev/blast-cubes.html)
- [TUNG SAHUR COLORING](https://thelearnquesters.pages.dev/tung-sahur-coloring.html)
- [MAHJONG SORT PUZZLE](https://thelearnquester.web.app/mahjong-sort-puzzle.html)
- [CATEGORY CAR 2](https://thelearnquester.web.app/category-car-2.html)
- [CATEGORY TOWER DEFENSE](https://learnquester.github.io/category-tower-defense.html)
- [M5 CITY DRIVER](https://thelearnquesters.pages.dev/m5-city-driver.html)
- [CATEGORY MOBILE2 112](https://learnquester.github.io/category-mobile2-112.html)
- [TANGLE MASTER 3D](https://thelearnquesters.pages.dev/tangle-master-3d.html)
- [ZOMBIE SPACE EPISODE II](https://thelearnquester.web.app/zombie-space-episode-ii.html)
- [FARM MERGE HARVEST](https://thelearnquesters.pages.dev/farm-merge-harvest.html)
- [CATEGORY SIMULATION](https://thelearnquester.web.app/category-simulation.html)
- [SUPER NINJA BALLOON](https://learnquester.github.io/super-ninja-balloon.html)
- [CATEGORY HERO72](https://thelearnquester.web.app/category-hero72.html)
- [STICK BOY BAZOOKA RAGDOLL](https://learnquester.github.io/stick-boy-bazooka-ragdoll.html)
- [COZY GARDEN IDLE](https://learnquester.github.io/cozy-garden-idle.html)
- [CATEGORY DESTROY256](https://studyquesthub.web.app/category-destroy256.html)
- [MAGIC AND WIZARDS MAHJONG](https://thelearnquesters.pages.dev/magic-and-wizards-mahjong.html)
- [CATEGORY MINECRAFT81](https://studyplaying.github.io/category-minecraft81.html)
- [SITEMAP](https://cryptotify.vercel.app/sitemap.html)
- [TYPING ADVENTURE](https://quizverses.github.io/typing-adventure.html)
- [HALLOWEEN CHALLENGE](https://learnquester.github.io/halloween-challenge.html)
- [LIGHT LINE](https://quizverses.github.io/light-line.html)
- [TRIVIA NATION](https://studyplayings.pages.dev/trivia-nation.html)
- [SECRET GALAXY MATCH THREE](https://studyplayings.pages.dev/secret-galaxy-match-three.html)
- [BABY PENGUIN FISHING](https://thelearnquesters.pages.dev/baby-penguin-fishing.html)
- [ROBOTS GONE WILD](https://thelearnquesters.pages.dev/robots-gone-wild.html)
- [CATEGORY BASKETBALL 2](https://quizverses.pages.dev/category-basketball-2.html)
- [PIPE PUZZLE CONNECT FLOW](https://thelearnquesters.pages.dev/pipe-puzzle-connect-flow.html)
- [SCREW PUZZLE](https://thelearnquesters.pages.dev/screw-puzzle.html)
- [GUESS WORD](https://thelearnquesters.pages.dev/guess-word.html)
- [DRUNK MAN 3D](https://thelearnquesters.pages.dev/drunk-man-3d.html)
- [DREAM RESTAURANT 3D](https://thelearnquesters.pages.dev/dream-restaurant-3d.html)
- [COLOR SCREW RESCUE PUZZLE](https://studyquests.pages.dev/color-screw-rescue-puzzle.html)
- [GRILL IT ALL](https://studyquests.pages.dev/grill-it-all.html)
- [CATEGORY CASUAL 4](https://thelearnquester.web.app/category-casual-4.html)
- [DISASSEMBLE THE PICTURE PUZZLE](https://quizverses.github.io/disassemble-the-picture-puzzle.html)
- [FENNEC THE FOX CLICK ADVENTURE](https://studyplaying.github.io/fennec-the-fox-click-adventure.html)
- [MINI SCRAPBOOK PAPER](https://learnquester.github.io/mini-scrapbook-paper.html)
- [MERMAIDCORE AESTHETICS](https://learnquester.github.io/mermaidcore-aesthetics.html)
- [CATEGORY CARDS](https://quizverses.github.io/category-cards.html)
- [WOODEN BOLTS AND NUTS](https://thelearnquesters.pages.dev/wooden-bolts-and-nuts.html)
- [SORT MY PARKING AREA](https://quizverses.github.io/sort-my-parking-area.html)
- [PAINT SPONGES PUZZLE](https://thelearnquesters.pages.dev/paint-sponges-puzzle.html)
- [IDOL LIVESTREAM DOLL DRESS UP](https://learnquester.github.io/idol-livestream-doll-dress-up.html)
- [THE WALKING DEADBLOCKS](https://thelearnquesters.pages.dev/the-walking-deadblocks.html)
- [OBBY VS ZOMBIES](https://thelearnquesters.pages.dev/obby-vs-zombies.html)
- [CATEGORY SHOOTER](https://quizverses.github.io/category-shooter.html)
- [CATEGORY BUILDING182](https://studyplayings.web.app/category-building182.html)
- [SEAT PUZZLE CUT THE ROPE](https://quizverses.github.io/seat-puzzle-cut-the-rope.html)
- [CATEGORY CONTENTKEEPER](https://thelearnquester.web.app/category-contentkeeper.html)
- [BLOX FRUITS](https://studyquests.pages.dev/blox-fruits.html)
- [MINECRAFT PIXEL WARFARE](https://thelearnquesters.pages.dev/minecraft-pixel-warfare.html)
- [BARBEE BLACK FRIDAY FASHION](https://studyquests.pages.dev/barbee-black-friday-fashion.html)
- [HEXA PUZZLE](https://thelearnquesters.pages.dev/hexa-puzzle.html)
- [WEDNESDAY LIGHT ACADEMIA](https://thelearnquesters.pages.dev/wednesday-light-academia.html)
- [DRAWER SORT](https://thelearnquesters.pages.dev/drawer-sort.html)
- [LABUBU COLORING ADVENTURE](https://thelearnquesters.pages.dev/labubu-coloring-adventure.html)
- [DRILL QUEST](https://studyplaying.github.io/drill-quest.html)
- [MOLANG MATCHN MUNCH](https://quizverses.github.io/molang-matchn-munch.html)
- [DOODLE DINO RUN](https://studyquests.pages.dev/doodle-dino-run.html)
- [LABUBU POP](https://thelearnquesters.pages.dev/labubu-pop.html)
- [CANDY MATCH PUZZLE](https://learnquester.github.io/candy-match-puzzle.html)
- [IDLE DAIRY FARM TYCOON](https://studyplaying.github.io/idle-dairy-farm-tycoon.html)
- [FASHION STYLIST SALON MAKEOVER](https://quizverses.github.io/fashion-stylist-salon-makeover.html)
- [HARLEY LEARNS TO LOVE](https://quizverses.github.io/harley-learns-to-love.html)
- [CUTE SHEEP SKYBLOCK](https://themindzone.pages.dev/cute-sheep-skyblock.html)
- [DIVINEX](https://studyplaying.github.io/divinex.html)
- [CATEGORY BATTLE GAMES](https://quizverses.github.io/category-battle-games.html)
- [MICROPLASTICS FEEDING](https://theskillquest.pages.dev/microplastics-feeding.html)
- [URBAN ASSAULT FORCE](https://thelearnquesters.pages.dev/urban-assault-force.html)
- [JELLY TOWER CRUSH](https://themindzone.pages.dev/jelly-tower-crush.html)
- [MAGIC FOREST MERGE THE SECRETS](https://quizverses.github.io/magic-forest-merge-the-secrets.html)
- [SKIBIDI TOILET VS CAMERAMAN SNIPER GAME](https://thelearnquesters.pages.dev/skibidi-toilet-vs-cameraman-sniper-game.html)
- [CATEGORY COOKING](https://theskillquest.pages.dev/category-cooking.html)
- [DIY PHONE CASE SHOP](https://studyquests.pages.dev/diy-phone-case-shop.html)
- [100 DOORS CHALLENGE](https://quizverses.github.io/100-doors-challenge.html)
- [ITALIAN BRAINROT QUIZ](https://themindzone.pages.dev/italian-brainrot-quiz.html)
- [OBBY TOILET LINE](https://studyplayings.web.app/obby-toilet-line.html)
- [ELLIE CHINESE NEW YEAR CELEBRATION](https://quizverses.github.io/ellie-chinese-new-year-celebration.html)
- [COSMO PET STARRY CARE](https://quizverses.github.io/cosmo-pet-starry-care.html)
- [CATEGORY DRESS UP97](https://thelearnquester.web.app/category-dress-up97.html)
- [MINE FPS SHOOTER NOOB ARENA](https://thelearnquesters.pages.dev/mine-fps-shooter-noob-arena.html)
- [GROW A GARDEN 3D](https://quizverses.github.io/grow-a-garden-3d.html)
- [CATEGORY AVOID295](https://theskillquest.pages.dev/category-avoid295.html)
- [CUBE CONNECT](https://studyplayings.web.app/cube-connect.html)
- [FAT CAT LIFE](https://studyquests.pages.dev/fat-cat-life.html)
- [CHARGER CITY DRIVER](https://quizverses.github.io/charger-city-driver.html)
- [TILE MATCH CAFE](https://themindzone.pages.dev/tile-match-cafe.html)
- [ONLINE CAR DESTRUCTION SIMULATOR 3D](https://quizverses.github.io/online-car-destruction-simulator-3d.html)
- [CRAZY ZOO SWIPE MATCH 3 PUZZLE GAME](https://themindzone.pages.dev/crazy-zoo-swipe-match-3-puzzle-game.html)
- [COOKING EMPIRE](https://themindzone.pages.dev/cooking-empire.html)
- [ANGRY CHIBI RUN](https://studyplaying.github.io/angry-chibi-run.html)
- [HAPPY MONSTERS 2](https://studyplayings.pages.dev/happy-monsters-2.html)
- [CATEGORY CAN T STOP PLAYING212](https://thelearnquester.web.app/category-can-t-stop-playing212.html)
- [MAKE AMERICA GREAT AGAIN](https://learnquester.github.io/make-america-great-again.html)
- [MERGE CUBE CHALLENGE](https://themindzone.pages.dev/merge-cube-challenge.html)
- [CATEGORY BYEPASSHUB](https://thelearnquester.web.app/category-byepasshub.html)
- [QUIZ X](https://studyquests.pages.dev/quiz-x.html)
- [SORT MY PARKING AREA](https://learnquester.github.io/sort-my-parking-area.html)
- [CATEGORY PIXEL313](https://quizverses-9d2f2.web.app/category-pixel313.html)
- [KNIFE UP 3D](https://quizverses.github.io/knife-up-3d.html)
- [PANDA MAHJONG CLASSIC](https://themindzone.pages.dev/panda-mahjong-classic.html)
- [MONSTER SCHOOL VS SIREN HEAD](https://quizverses-9d2f2.web.app/monster-school-vs-siren-head.html)
- [HALLOWEEN STICKMAN](https://studyplaying.github.io/halloween-stickman.html)
- [CATEGORY DYKNOW](https://thelearnquester.web.app/category-dyknow.html)
- [CATEGORY DRAWING](https://thelearnquester.web.app/category-drawing.html)
- [MY FARM LIFE](https://quizverses.github.io/my-farm-life.html)
- [CATEGORY COLLECT565](https://thelearnquester.web.app/category-collect565.html)
- [MY DREAMY FLORA FASHION LOOK](https://themindzone.pages.dev/my-dreamy-flora-fashion-look.html)
- [DRIVERZ ED](https://thelearnquesters.pages.dev/driverz-ed.html)
- [BUBBLE SHOOTER HAWAII](https://thelearnquesters.pages.dev/bubble-shooter-hawaii.html)
- [STICKMAN MEGA BOSS BATTLES](https://themindzone.pages.dev/stickman-mega-boss-battles.html)
- [BRICK MATCH](https://studyplayings.web.app/brick-match.html)
- [SLICER DUO](https://studyplaying.github.io/slicer-duo.html)
- [SANDWICH RUNNER](https://themindzone.pages.dev/sandwich-runner.html)
- [FURY OF THE STEAMPUNK PRINCESS](https://studyplayings.web.app/fury-of-the-steampunk-princess.html)
- [ROLLER COASTER RUSH](https://quizverses.github.io/roller-coaster-rush.html)
- [MART PUZZLE SHOPPING SORT](https://quizverses.github.io/mart-puzzle-shopping-sort.html)
- [WINTER COSMOFEST](https://thelearnquesters.pages.dev/winter-cosmofest.html)
- [OBBY PUMP UP YOUR MUSCLES 1 PER SECOND](https://thelearnquesters.pages.dev/obby-pump-up-your-muscles-1-per-second.html)
- [ULTRA REALISTIC BLOCKCRAFT](https://studyplaying.github.io/ultra-realistic-blockcraft.html)
- [DIGGING MOLES](https://themindzone.pages.dev/digging-moles.html)
- [10K](https://themindzone.pages.dev/10k.html)
- [ANGRY CHIBI RUN](https://quizverses.github.io/angry-chibi-run.html)
- [CATEGORY TITANIUMNETWORK](https://quizverses-9d2f2.web.app/category-titaniumnetwork.html)
- [FORMULA TRAFFIC RACER](https://learnquester.github.io/formula-traffic-racer.html)
- [SORT MASTER](https://studyquests.pages.dev/sort-master.html)
