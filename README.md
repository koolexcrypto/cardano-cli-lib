# cardano-cli-lib
# NOT UPDATED YET

# JOIN THE COMMUNITY ON DISCORD
https://discord.gg/JgQ7aR8nuS

## Build and run for dev 

First, make sure Cardano-Node is running and cardano-cli is accessible

```bash
npm install
npm run dev
```


## Build for production

Run the following command under the root directory of the project:
    
```bash
npm run build
```



## Directories & files required for running the NodeJS app

- build
- public
- .docker.env.prod
- .env.local
- .env.production
- DockerFile
- docker-compose-prod.yml
- next-env.d.ts
- next.config.js
- package.json
- tsconfig.json


- Download config files under /home/cardano/config/

- Run the following command under the root directory of the project:
```bash
docker-compose -f docker-compose-prod.yml --env-file .docker.env.prod up --build -d
```


