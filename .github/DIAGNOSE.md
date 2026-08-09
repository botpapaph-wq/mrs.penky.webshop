# Selbstdiagnose des Deployments

Lauf: 2026-08-09 06:52 UTC  ·  Commit `b453863`

## Rechte dieses Workflow-Tokens
```
HTTP/2.0 200 OK
X-Accepted-Github-Permissions: metadata=read
```

## Ist das Repo oeffentlich?
```
{"has_pages":false,"private":false,"visibility":"public"}
```

## Aktueller Pages-Status
```
{"message":"Not Found","documentation_url":"https://docs.github.com/rest/pages/pages#get-a-apiname-pages-site","status":"404"}gh: Not Found (HTTP 404)
```

## Versuch, Pages einzuschalten (build_type=workflow)
```
{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/pages/pages#create-a-apiname-pages-site","status":"403"}gh: Resource not accessible by integration (HTTP 403)
```

## Pages-Status danach
```
{"message":"Not Found","documentation_url":"https://docs.github.com/rest/pages/pages#get-a-apiname-pages-site","status":"404"}gh: Not Found (HTTP 404)
```
