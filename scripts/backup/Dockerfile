FROM alpine:3.20
RUN apk add --no-cache postgresql16-client tzdata
COPY run-backup.sh /usr/local/bin/run-backup.sh
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/run-backup.sh
ENV TZ=America/Lima
CMD ["crond", "-f", "-l", "2"]
