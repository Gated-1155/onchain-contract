# BadgeToken — ERC-1155 배지 dApp (ethers + mocha 버전)

`../erc-1155`(viem + `node:test`)와 동일한 `BadgeToken` 컨트랙트를, **ethers.js + Mocha/Chai** 스택으로 그대로 옮겨 쓴 비교/학습용 프로젝트. 컨트랙트 로직(`contracts/BadgeToken.sol`)은 완전히 동일하고, 달라지는 건 테스트/스크립트가 체인과 상호작용하는 방식뿐이다.

> 이 프로젝트는 아직 어떤 네트워크에도 배포되지 않았다. 실제 라이브 배포·Notion 설계 문서·전송 경로 조사·실패 시나리오 문서는 전부 `../erc-1155`가 원본이다.

## 프로젝트 구성

```
contracts/BadgeToken.sol             ERC-1155 배지 컨트랙트 (전송·승인 전면 차단, erc-1155와 동일)
contracts/test/MaliciousReceiver.sol 재진입 공격 재현용 테스트 전용 컨트랙트
test/BadgeToken.ts                   정상 동작 검증 (ethers + mocha + chai)
test/BadgeToken.failureScenarios.ts  실패 시나리오 재현 테스트
scripts/deploy.ts                    Amoy 배포 스크립트
scripts/check-amoy-network.ts        Amoy RPC 연결 확인
scripts/check-balance.ts             배포자 잔액 확인
scripts/estimate-deploy-gas.ts       배포/민팅 gas 비용 추정
```

## erc-1155(viem)와 다른 점 — 비교 포인트

| | erc-1155 | onchain-contract |
| --- | --- | --- |
| 체인 클라이언트 | viem | ethers.js v6 |
| 테스트 러너 | `node:test` | Mocha |
| 단언(assertion) | `viem.assertions.*` | chai (`expect(...).to.be.revertedWithCustomError(...)`) |
| write 호출 | `contract.write.fn([args], {account})` | `contract.connect(signer).fn(...args)` |
| read 호출 | `contract.read.fn([args])` | `contract.fn(...args)` |
| 이벤트/에러 인자 매칭 | 배열로 전체 비교 | `.withArgs(...)` 체이닝, 동적 값은 `anyValue` |

## 사용법

### 테스트

```shell
npm test          # 전체 (Solidity + TypeScript)
npm run test:ts    # TypeScript(mocha)만
npm run test:sol   # Solidity만
```

### 타입 체크

```shell
npm run typecheck
```

### Amoy 배포 (아직 실행 안 함)

`.env`에 `AMOY_RPC_URL`, `PRIVATE_KEY` 필요. `BADGE_ADMIN_ADDRESS`/`BADGE_PAUSER_ADDRESS`/`BADGE_MINTER_ADDRESS`는 선택 사항 — 안 정하면 배포자 주소로 기본 설정됨.

```shell
npm run deploy:amoy
```

### Polygonscan/Sourcify 검증

```shell
npx hardhat verify --network amoy <주소> <defaultAdmin> <pauser> <minter>
```
