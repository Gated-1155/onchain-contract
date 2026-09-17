# BadgeToken — ERC-1155 배지 dApp (ethers + mocha 버전)

`../erc-1155`(viem + `node:test`)와 동일한 `BadgeToken` 컨트랙트를, **ethers.js + Mocha/Chai** 스택으로 그대로 옮겨 쓴 비교 프로젝트. 컨트랙트 로직(`contracts/BadgeToken.sol`)은 완전히 동일하고, 달라지는 건 테스트/스크립트가 체인과 상호작용하는 방식뿐이다.

> Notion 설계 문서·전송 경로 조사·실패 시나리오 문서는 전부 `../erc-1155`가 원본이다. 이 저장소는 그 설계를 그대로 구현만 옮긴 것.

## Polygon Amoy 배포 정보

- **컨트랙트 주소**: [`0xc85B40C6bD74EA71d3f08dBa316539D36DCedbCC`](https://amoy.polygonscan.com/address/0xc85B40C6bD74EA71d3f08dBa316539D36DCedbCC)
- **배포 스크립트**: `scripts/deploy.ts` (`npm run deploy:amoy`) — 배포 직후 A(id=1, 전송불가)/B(id=2, 전송불가)/C(id=3, 전송가능) 자동 등록까지 완료된 상태
- **생성자 인자**: `defaultAdmin`/`pauser`/`minter` 전부 배포자 본인 주소(`0x37a3Ed7De6C55C86bc6Bec6035e36885Ab405f80`)로 동일 설정
- **검증 상태**: Polygonscan에 "Source Code Verified / Exact Match"로 표시됨 (Sourcify 경유). Sourcify 리포지토리: https://sourcify.dev/server/repo-ui/80002/0xc85B40C6bD74EA71d3f08dBa316539D36DCedbCC
- **주의**: `scripts/deploy.ts`는 Ignition이 아니라 일반 스크립트라 재배포 시 새 주소가 생김(journal 없음).

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

### Amoy 재배포

`.env`에 `AMOY_RPC_URL`, `PRIVATE_KEY` 필요. `BADGE_ADMIN_ADDRESS`/`BADGE_PAUSER_ADDRESS`/`BADGE_MINTER_ADDRESS`는 선택 사항 — 안 정하면 배포자 주소로 기본 설정됨.

```shell
npm run deploy:amoy
```

### Polygonscan/Sourcify 검증

```shell
npx hardhat verify --network amoy <주소> <defaultAdmin> <pauser> <minter>
```
